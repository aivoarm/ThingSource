const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { runAgent } = require('./agent');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dataDir = path.join(__dirname, 'data');
const publicDir = path.join(__dirname, 'public');
const postsPath = path.join(publicDir, 'posts.json');
const settingsPath = path.join(dataDir, 'settings.json');
const logPath = path.join(dataDir, 'agent_run.log');
const subscribersPath = path.join(dataDir, 'subscribers.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Global Agent State
let agentState = {
  isRunning: false,
  lastRunTime: null,
  error: null
};

// Cron Job Reference
let scheduledCronJob = null;

// Helper: Load Settings
function getSettings() {
  const defaultSettings = {
    apiKey: process.env.GEMINI_API_KEY || '',
    cronSchedule: '0 12 * * *', // Default: Daily at noon
    topicsQueue: [],
    webhookUrl: '',
    webhookSecret: '',
    resendApiKey: process.env.RE_API || process.env.RESEND_API_KEY || '',
    resendSender: process.env.SENDER_EMAIL || 'onboarding@resend.dev'
  };

  if (fs.existsSync(settingsPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return { ...defaultSettings, ...saved };
    } catch (e) {
      console.error("Failed to read settings.json, using defaults:", e);
    }
  }
  return defaultSettings;
}

// Helper: Save Settings
function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

// Helper: Publish Post to Webhook
async function publishPostToWebhook(post, settings) {
  const url = settings.webhookUrl;
  if (!url) {
    console.log("No webhook URL configured. Skipping remote publish.");
    return { success: false, error: "No webhook URL configured." };
  }

  console.log(`Publishing post to remote: ${url}`);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': settings.webhookSecret ? `Bearer ${settings.webhookSecret}` : undefined
      },
      body: JSON.stringify(post)
    });

    const text = await response.text();
    console.log(`Publish webhook response: [${response.status}] ${text}`);
    return { success: response.ok, status: response.status, body: text };
  } catch (err) {
    console.error("Failed to publish to webhook:", err);
    return { success: false, error: err.message };
  }
}

// Helper: Convert Markdown to HTML for email
function mdToHtml(md) {
  if (!md) return '';
  let html = md
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .trim();
  
  // Basic bullet list parser
  if (html.includes('<br>- ')) {
    html = html.replace(/<br>- (.*?)(?=(<br>- |$))/g, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>)/g, '<ul>$1</ul>');
  }
  
  return `<p>${html}</p>`;
}

// Helper: Escape XML entities
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Helper: Get Category Gradient
function getCategoryGradient(category, id) {
  const gradients = [
    { from: '#6366f1', to: '#a855f7', to2: '#ec4899' }, // Indigo-Purple-Pink
    { from: '#f59e0b', to: '#ef4444', to2: '#db2777' }, // Amber-Red-Pink
    { from: '#10b981', to: '#06b6d4', to2: '#3b82f6' }, // Emerald-Cyan-Blue
    { from: '#8b5cf6', to: '#6366f1', to2: '#3b82f6' }  // Purple-Indigo-Blue
  ];
  
  let hash = 0;
  const idStr = id || 'default';
  for (let i = 0; i < idStr.length; i++) {
    hash += idStr.charCodeAt(i);
  }
  return gradients[hash % gradients.length];
}

// Helper: Generate Dynamic SVG Banner
function generateSvgBanner(post) {
  const title = post.title || 'ThingSource';
  const category = post.category || 'Discovery';
  const grad = getCategoryGradient(category, post.id);

  // Word wrapping for title (max ~34 chars per line)
  const maxChars = 34;
  const words = title.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxChars) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  const categoryEscaped = escapeXml(category.toUpperCase());
  const titleLinesEscaped = lines.slice(0, 3).map(l => escapeXml(l)); // Cap at 3 lines
  
  const titleSvgElements = titleLinesEscaped.map((line, idx) => `
    <text x="40" y="${115 + idx * 30}" class="title">${line}</text>
  `).join('');

  return `
<svg width="600" height="220" viewBox="0 0 600 220" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${grad.from}" />
      <stop offset="50%" stop-color="${grad.to}" />
      <stop offset="100%" stop-color="${grad.to2}" />
    </linearGradient>
    <linearGradient id="overlayGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </linearGradient>
    <style>
      .brand { font-family: system-ui, -apple-system, sans-serif; font-weight: 800; font-size: 13px; fill: #ffffff; opacity: 0.85; letter-spacing: 5px; text-transform: uppercase; }
      .category { font-family: system-ui, -apple-system, sans-serif; font-weight: 700; font-size: 11px; fill: #ffffff; opacity: 0.95; letter-spacing: 1.5px; text-transform: uppercase; }
      .title { font-family: Georgia, serif; font-weight: bold; font-size: 25px; fill: #ffffff; }
    </style>
  </defs>

  <!-- Background with rounded corners -->
  <rect width="600" height="220" rx="14" fill="url(#bgGrad)" />
  <rect width="600" height="220" rx="14" fill="url(#overlayGrad)" />

  <!-- Modern Graphic Circles/Lines -->
  <circle cx="530" cy="50" r="120" fill="#ffffff" fill-opacity="0.06" />
  <circle cx="530" cy="50" r="80" fill="#ffffff" fill-opacity="0.04" />
  <path d="M-20,170 Q 150,220 320,150 T 620,180 L 620,220 L -20,220 Z" fill="#ffffff" fill-opacity="0.05" />
  <path d="M-20,185 Q 180,230 350,165 T 620,195 L 620,220 L -20,220 Z" fill="#ffffff" fill-opacity="0.03" />

  <!-- Brand Name -->
  <text x="40" y="45" class="brand">ThingSource</text>
  
  <!-- Category Pill Line -->
  <rect x="40" y="65" width="100" height="3" rx="1.5" fill="#ffffff" fill-opacity="0.3" />
  <text x="40" y="85" class="category">${categoryEscaped}</text>

  <!-- Title Lines -->
  ${titleSvgElements}
</svg>
  `.trim();
}

// Helper: Broadcast Email Newsletter via Resend
async function sendNewsletter(post, settings) {
  const apiKey = settings.resendApiKey;
  const sender = settings.resendSender || 'onboarding@resend.dev';

  if (!apiKey) {
    console.log("[Newsletter] Resend API Key not configured. Skipping email broadcast.");
    return { success: false, error: "Resend API Key not configured." };
  }

  // Load active subscribers
  let subscribers = [];
  if (fs.existsSync(subscribersPath)) {
    try {
      subscribers = JSON.parse(fs.readFileSync(subscribersPath, 'utf8'));
    } catch (e) {
      console.error("Error reading subscribers file:", e);
    }
  }

  if (subscribers.length === 0) {
    console.log("[Newsletter] No active subscribers found. Skipping email broadcast.");
    return { success: false, error: "No subscribers found." };
  }

  const emails = subscribers.map(sub => sub.email);
  console.log(`[Newsletter] Preparing broadcast to ${emails.length} subscribers...`);

  // 1. Generate dynamic SVG Banner & Encode in base64
  const svgBanner = generateSvgBanner(post);
  const svgBase64 = Buffer.from(svgBanner).toString('base64');
  const emailBannerSrc = `data:image/svg+xml;base64,${svgBase64}`;
  const bannerGradient = getCategoryGradient(post.category, post.id);

  // 2. Unsplash cover photo (if any)
  const coverImage = post.images && post.images.length > 0 ? post.images[0] : '';
  const isLocalImage = coverImage.startsWith('/images/');
  const emailCoverUrl = isLocalImage 
    ? `https://images.unsplash.com/featured/?${encodeURIComponent(post.topic)}`
    : coverImage;

  // Escaping texts
  const titleEscaped = escapeXml(post.title);
  const categoryEscaped = escapeXml(post.category || 'Discovery');
  const summaryEscaped = escapeXml(post.summary);
  const topicEscaped = escapeXml(post.topic);

  const sectionsHtml = post.sections.map(sec => `
    <div class="section-heading">${escapeXml(sec.heading)}</div>
    <div class="section-content">${mdToHtml(sec.content)}</div>
  `).join('');

  const factsHtml = post.funFacts && post.funFacts.length > 0 
    ? `
      <div class="fun-facts">
        <div class="fun-facts-title">Surprising Fun Facts</div>
        <ul>
          ${post.funFacts.map(fact => `<li>${escapeXml(fact)}</li>`).join('')}
        </ul>
      </div>
    ` : '';

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titleEscaped}</title>
    <style>
      body { font-family: Georgia, serif; line-height: 1.6; color: #292524; background-color: #fcfaf7; margin: 0; padding: 0; }
      .wrapper { background-color: #fcfaf7; padding: 30px 10px; }
      .container { max-width: 600px; margin: 0 auto; padding: 30px; background-color: #ffffff; border: 1px solid #e7e2d4; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); }
      
      /* Dynamic Banner Container and Image with Gradient Fallback */
      .banner-container {
        background: linear-gradient(135deg, ${bannerGradient.from} 0%, ${bannerGradient.to} 50%, ${bannerGradient.to2} 100%);
        border-radius: 12px;
        margin-bottom: 25px;
        overflow: hidden;
        min-height: 150px;
      }
      .banner-img {
        display: block;
        width: 100%;
        height: auto;
        border: 0;
      }
      
      .header-img { width: 100%; max-height: 250px; object-fit: cover; border-radius: 8px; margin-bottom: 25px; }
      .category { font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; text-transform: uppercase; color: ${bannerGradient.to2}; letter-spacing: 1.5px; }
      .title { font-family: Arial, sans-serif; font-size: 26px; font-weight: 800; color: #1c1917; line-height: 1.25; margin-top: 10px; margin-bottom: 8px; }
      .meta { font-family: Arial, sans-serif; font-size: 12px; color: #78716c; margin-bottom: 25px; }
      .summary { font-size: 16px; font-style: italic; color: #44403c; border-left: 3px solid ${bannerGradient.from}; padding-left: 12px; margin-bottom: 30px; line-height: 1.7; }
      .section-heading { font-family: Arial, sans-serif; font-size: 18px; font-weight: bold; color: #1c1917; margin-top: 35px; margin-bottom: 10px; border-bottom: 1px solid #e5e5e0; padding-bottom: 6px; }
      .section-content { font-size: 15px; color: #292524; line-height: 1.8; }
      .section-content p { margin: 0 0 15px 0; }
      .fun-facts { background-color: #f5f2eb; border: 1px solid #e7e2d4; border-radius: 8px; padding: 20px; margin-top: 40px; }
      .fun-facts-title { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #78350f; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.5px; }
      .fun-facts ul { margin: 0; padding-left: 20px; }
      .fun-facts li { font-size: 14px; color: #44403c; margin-bottom: 8px; }
      .footer { margin-top: 45px; border-top: 1px solid #e7e2d4; padding-top: 25px; font-family: Arial, sans-serif; font-size: 11px; color: #78716c; text-align: center; }
      .footer a { color: ${bannerGradient.from}; text-decoration: none; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <!-- Dynamic Header SVG Banner -->
        <div class="banner-container">
          <img class="banner-img" src="${emailBannerSrc}" alt="${titleEscaped}">
        </div>

        <div class="category">${categoryEscaped}</div>
        <div class="title">${titleEscaped}</div>
        <div class="meta">🔍 Topic: ${topicEscaped} | 📅 ${new Date(post.date).toLocaleDateString()}</div>
        
        <div class="summary">${summaryEscaped}</div>
        
        <!-- Story Cover Photo -->
        ${emailCoverUrl ? `<img class="header-img" src="${emailCoverUrl}" alt="Discovery visual">` : ''}
        
        ${sectionsHtml}
        ${factsHtml}
        
        <div class="footer">
          <p>You received this email because you subscribed to **ThingSource** origin discoveries.</p>
          <p>Want to unsubscribe? <a href="{{UNSUBSCRIBE_LINK}}">Click here to unsubscribe instantly</a>.</p>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  try {
    let successCount = 0;
    for (const email of emails) {
      try {
        const unsubscribeLink = `http://localhost:${PORT}/unsubscribe?email=${encodeURIComponent(email)}`;
        const recipientHtml = emailHtml.replace('{{UNSUBSCRIBE_LINK}}', unsubscribeLink);

        const payload = {
          from: `ThingSource <${sender}>`,
          to: email, // Direct to subscriber
          subject: `New Origin Discovery: ${post.title}`,
          html: recipientHtml
        };

        console.log(`[Newsletter] Calling Resend API for: ${email}`);
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
          console.error(`[Newsletter] Failed to send to ${email}:`, data.message || `HTTP ${response.status}`);
        } else {
          console.log(`[Newsletter] Sent to ${email} (ID: ${data.id})`);
          successCount++;
        }
      } catch (err) {
        console.error(`[Newsletter] Network error sending to ${email}:`, err.message);
      }
    }

    console.log(`[Newsletter] Broadcast completed: successfully sent to ${successCount}/${emails.length} subscribers.`);
    return { success: successCount > 0, sentCount: successCount };
  } catch (err) {
    console.error("[Newsletter] Failed to send newsletter:", err);
    return { success: false, error: err.message };
  }
}

// Trigger Agent execution safely
async function executeAgentRun(customTopic = null) {
  if (agentState.isRunning) {
    console.log("Agent is already running. Skipping trigger.");
    return;
  }

  agentState.isRunning = true;
  agentState.error = null;
  
  // Update environment variable dynamically for agent if overridden in settings.json with a valid key
  const settings = getSettings();
  if (settings.apiKey && !settings.apiKey.startsWith("your_")) {
    process.env.GEMINI_API_KEY = settings.apiKey;
  }

  // Dequeue topic if no custom topic and topics queue has items
  let finalTopic = customTopic;
  if (!finalTopic && settings.topicsQueue && settings.topicsQueue.length > 0) {
    finalTopic = settings.topicsQueue.shift();
    saveSettings(settings); // save settings with topic dequeued
    console.log(`Dequeued topic for scheduled run: "${finalTopic}"`);
  }

  try {
    const createdPost = await runAgent(finalTopic);
    if (createdPost && typeof createdPost === 'object') {
      // Auto-publish to Webhook if configured
      if (settings.webhookUrl) {
        console.log(`[Auto-Publish] Triggering publish for: "${createdPost.title}"`);
        await publishPostToWebhook(createdPost, settings);
      }
      
      // Auto-publish to Newsletter if Resend is configured
      if (settings.resendApiKey) {
        console.log(`[Auto-Publish] Triggering email newsletter broadcast for: "${createdPost.title}"`);
        await sendNewsletter(createdPost, settings);
      }
    } else if (!createdPost) {
      agentState.error = "Agent run failed. Check agent logs.";
    }
  } catch (err) {
    console.error("Error during background agent execution:", err);
    agentState.error = err.message;
  } finally {
    agentState.isRunning = false;
    agentState.lastRunTime = new Date().toISOString();
  }
}

// Setup or Update the Cron Schedule
function setupCronSchedule() {
  const settings = getSettings();
  
  if (scheduledCronJob) {
    scheduledCronJob.stop();
    console.log("Stopped existing cron job.");
  }

  const schedule = settings.cronSchedule;
  if (!schedule || schedule === 'manual' || !cron.validate(schedule)) {
    console.log("Scheduler disabled or invalid schedule cron expression.");
    return;
  }

  scheduledCronJob = cron.schedule(schedule, () => {
    console.log(`[Scheduler] Cron triggered run for schedule: ${schedule}`);
    executeAgentRun();
  });
  
  console.log(`[Scheduler] Successfully scheduled cron job: "${schedule}"`);
}

// Start Cron Scheduler on startup
setupCronSchedule();

// GET: Unsubscribe Route
app.get('/unsubscribe', (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).send('<h1>Error</h1><p>Email parameter is missing.</p>');
  }
  
  if (fs.existsSync(subscribersPath)) {
    try {
      let subscribers = JSON.parse(fs.readFileSync(subscribersPath, 'utf8'));
      const initialLength = subscribers.length;
      const trimmed = email.trim().toLowerCase();
      subscribers = subscribers.filter(sub => sub.email !== trimmed);
      
      if (subscribers.length === initialLength) {
        return res.send(`
          <html>
          <head>
            <title>Unsubscribe - ThingSource</title>
            <style>
              body { font-family: sans-serif; text-align: center; padding: 50px; background-color: #fdfbf7; color: #292524; }
              .card { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; border: 1px solid #e7e2d4; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
              h1 { color: #dc2626; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Not Found</h1>
              <p>Email address <strong>${email}</strong> was not found in our subscriber list.</p>
            </div>
          </body>
          </html>
        `);
      }
      
      fs.writeFileSync(subscribersPath, JSON.stringify(subscribers, null, 2), 'utf8');
      return res.send(`
        <html>
        <head>
          <title>Unsubscribed - ThingSource</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 50px; background-color: #fdfbf7; color: #292524; }
            .card { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; border: 1px solid #e7e2d4; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            h1 { color: #16a34a; }
            a { display: inline-block; margin-top: 20px; color: #8b5cf6; text-decoration: none; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Unsubscribed</h1>
            <p>You have been successfully unsubscribed from the <strong>ThingSource</strong> newsletter.</p>
            <p>We're sorry to see you go!</p>
            <a href="/">Go back to Homepage</a>
          </div>
        </body>
        </html>
      `);
    } catch (e) {
      return res.status(500).send('<h1>Error</h1><p>Failed to unsubscribe. Please try again later.</p>');
    }
  }
  return res.status(404).send('<h1>Error</h1><p>No subscribers list found.</p>');
});

// GET: Dynamic SVG Banner Route for posts
app.get('/api/posts/:id/banner.svg', (req, res) => {
  const { id } = req.params;
  if (!fs.existsSync(postsPath)) {
    return res.status(404).send('No posts found');
  }
  try {
    const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
    const post = posts.find(p => p.id === id);
    if (!post) {
      return res.status(404).send('Post not found');
    }
    const svg = generateSvgBanner(post);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(svg);
  } catch (err) {
    return res.status(500).send('Error generating banner: ' + err.message);
  }
});

// API: Get Blog Posts
app.get('/api/posts', (req, res) => {
  if (fs.existsSync(postsPath)) {
    try {
      const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
      return res.json(posts);
    } catch (e) {
      return res.status(500).json({ error: "Failed to read blog database." });
    }
  }
  return res.json([]);
});

// API: Delete Post
app.delete('/api/posts/:id', (req, res) => {
  const { id } = req.params;
  if (fs.existsSync(postsPath)) {
    try {
      let posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
      const initialLength = posts.length;
      posts = posts.filter(post => post.id !== id);
      if (posts.length === initialLength) {
        return res.status(404).json({ error: "Post not found" });
      }
      fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
      return res.json({ success: true, message: "Post deleted" });
    } catch (e) {
      return res.status(500).json({ error: "Failed to delete post." });
    }
  }
  return res.status(404).json({ error: "No posts exist." });
});

// API: Get App Status and Logs
app.get('/api/status', (req, res) => {
  let logs = "";
  if (fs.existsSync(logPath)) {
    try {
      logs = fs.readFileSync(logPath, 'utf8');
    } catch (e) {
      logs = "Error reading log file.";
    }
  }
  
  const settings = getSettings();
  
  res.json({
    isRunning: agentState.isRunning,
    lastRunTime: agentState.lastRunTime,
    error: agentState.error,
    logs: logs,
    topicsQueueCount: settings.topicsQueue ? settings.topicsQueue.length : 0,
    cronSchedule: settings.cronSchedule
  });
});

// API: Run Agent Now (Manual Trigger)
app.post('/api/run-agent', (req, res) => {
  const { topic } = req.body;
  if (agentState.isRunning) {
    return res.status(409).json({ error: "Agent is already running." });
  }

  // Trigger asynchronously
  executeAgentRun(topic || null);
  
  res.json({ success: true, message: "Agent run started in background." });
});

// API: Get Current Settings (excluding sensitive API key characters in responses, but we can return length/status)
app.get('/api/settings', (req, res) => {
  const settings = getSettings();
  res.json({
    hasApiKey: !!settings.apiKey,
    apiKeyLength: settings.apiKey ? settings.apiKey.length : 0,
    cronSchedule: settings.cronSchedule,
    topicsQueue: settings.topicsQueue,
    webhookUrl: settings.webhookUrl || '',
    webhookSecret: settings.webhookSecret || '',
    hasResendApiKey: !!settings.resendApiKey,
    resendApiKeyLength: settings.resendApiKey ? settings.resendApiKey.length : 0,
    resendSender: settings.resendSender || 'onboarding@resend.dev'
  });
});

// API: Update Settings
app.post('/api/settings', (req, res) => {
  const { apiKey, cronSchedule, topicsQueue, webhookUrl, webhookSecret, resendApiKey, resendSender } = req.body;
  const currentSettings = getSettings();

  if (apiKey !== undefined) {
    // If user provided a placeholder or actual key, save it
    currentSettings.apiKey = apiKey;
  }
  if (cronSchedule !== undefined) {
    if (cronSchedule !== 'manual' && !cron.validate(cronSchedule)) {
      return res.status(400).json({ error: "Invalid cron expression." });
    }
    currentSettings.cronSchedule = cronSchedule;
  }
  if (topicsQueue !== undefined && Array.isArray(topicsQueue)) {
    currentSettings.topicsQueue = topicsQueue;
  }
  if (webhookUrl !== undefined) {
    currentSettings.webhookUrl = webhookUrl.trim();
  }
  if (webhookSecret !== undefined) {
    currentSettings.webhookSecret = webhookSecret.trim();
  }
  if (resendApiKey !== undefined) {
    currentSettings.resendApiKey = resendApiKey.trim();
  }
  if (resendSender !== undefined) {
    currentSettings.resendSender = resendSender.trim();
  }

  saveSettings(currentSettings);
  
  // Re-initialize cron schedule
  setupCronSchedule();

  res.json({ success: true, message: "Settings updated successfully." });
});

// API: Publish Post to Webhook (Manual Trigger)
app.post('/api/posts/:id/publish', async (req, res) => {
  const { id } = req.params;
  const settings = getSettings();
  if (!settings.webhookUrl) {
    return res.status(400).json({ error: "Remote Webhook URL is not configured. Please set it in Settings." });
  }

  if (fs.existsSync(postsPath)) {
    try {
      const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
      const post = posts.find(p => p.id === id);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      const result = await publishPostToWebhook(post, settings);
      if (result.success) {
        return res.json({ success: true, message: "Published successfully!", status: result.status, body: result.body });
      } else {
        return res.status(502).json({ error: result.error || `Webhook returned status ${result.status}`, status: result.status, body: result.body });
      }
    } catch (e) {
      return res.status(500).json({ error: "Failed to publish post: " + e.message });
    }
  }
  return res.status(404).json({ error: "No posts found." });
});

// API: Subscribe Newsletter
app.post('/api/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  let subscribers = [];
  if (fs.existsSync(subscribersPath)) {
    try {
      subscribers = JSON.parse(fs.readFileSync(subscribersPath, 'utf8'));
    } catch (e) {
      console.error("Error reading subscribers database:", e);
    }
  }

  const trimmed = email.trim().toLowerCase();
  if (subscribers.some(sub => sub.email === trimmed)) {
    return res.status(409).json({ error: "You are already subscribed to the newsletter!" });
  }

  subscribers.push({ email: trimmed, date: new Date().toISOString() });
  fs.writeFileSync(subscribersPath, JSON.stringify(subscribers, null, 2), 'utf8');
  res.json({ success: true, message: "Subscription successful!" });
});

// API: Get Subscribers List (Admin)
app.get('/api/subscribers', (req, res) => {
  let subscribers = [];
  if (fs.existsSync(subscribersPath)) {
    try {
      subscribers = JSON.parse(fs.readFileSync(subscribersPath, 'utf8'));
    } catch (e) {
      console.error("Error reading subscribers:", e);
    }
  }
  res.json(subscribers);
});

// API: Unsubscribe (Admin or Link)
app.delete('/api/subscribers', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email parameter required." });
  }

  if (fs.existsSync(subscribersPath)) {
    try {
      let subscribers = JSON.parse(fs.readFileSync(subscribersPath, 'utf8'));
      const initialLength = subscribers.length;
      const trimmed = email.trim().toLowerCase();
      subscribers = subscribers.filter(sub => sub.email !== trimmed);
      
      if (subscribers.length === initialLength) {
        return res.status(404).json({ error: "Email address not found in subscribers." });
      }

      fs.writeFileSync(subscribersPath, JSON.stringify(subscribers, null, 2), 'utf8');
      return res.json({ success: true, message: "Unsubscribed successfully." });
    } catch (e) {
      return res.status(500).json({ error: "Failed to modify subscribers database." });
    }
  }
  return res.status(404).json({ error: "No subscribers found." });
});

app.listen(PORT, () => {
  console.log(`ThingSource Web Server listening on http://localhost:${PORT}`);
});
