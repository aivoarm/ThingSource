const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { runAgent } = require('./agent');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Helper: Parse Cookie from Request headers
const getCookie = (req, name) => {
  const rc = req.headers.cookie;
  if (!rc) return null;
  const cookies = rc.split(';').reduce((acc, cookie) => {
    const parts = cookie.split('=');
    acc[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    return acc;
  }, {});
  return cookies[name] || null;
};

// Admin Authentication Middleware
const adminAuth = (req, res, next) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return next();
  }
  const clientPassword = req.headers['x-admin-password'] || req.query.password || getCookie(req, 'admin_password');
  if (clientPassword === adminPassword) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Invalid admin password." });
};

// POST: Login Endpoint
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    return res.status(500).json({ error: "Admin password is not configured on the server." });
  }
  
  if (password === adminPassword) {
    res.setHeader('Set-Cookie', `admin_password=${encodeURIComponent(password)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
    return res.json({ success: true });
  }
  
  return res.status(401).json({ error: "Invalid password." });
});

// POST: Logout Endpoint
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_password=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  return res.json({ success: true });
});

// GET: Secure Admin Dashboard Route
app.get('/admin', (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
  }
  
  const cookiePassword = getCookie(req, 'admin_password');
  if (cookiePassword === adminPassword) {
    return res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
  }
  
  return res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// GET: Secure Admin JS Route
app.get('/admin.js', (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const cookiePassword = getCookie(req, 'admin_password');
  
  if (adminPassword && cookiePassword !== adminPassword) {
    return res.status(401).send('Unauthorized');
  }
  return res.sendFile(path.join(__dirname, 'admin', 'admin.js'));
});

// Redirect legacy /admin.html requests
app.get('/admin.html', (req, res) => {
  res.redirect('/admin');
});

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
    resendSender: process.env.SENDER_EMAIL || 'onboarding@resend.dev',
    resendAudienceId: process.env.RESEND_AUDIENCE_ID || '',
    googleSheetsUrl: process.env.GOOGLE_SHEETS_URL || ''
  };

  if (fs.existsSync(settingsPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const merged = { ...defaultSettings, ...saved };
      
      // Override placeholders/defaults if the environment variable has a real value
      if ((!merged.googleSheetsUrl || merged.googleSheetsUrl.includes('AKfycbytest')) && process.env.GOOGLE_SHEETS_URL) {
        merged.googleSheetsUrl = process.env.GOOGLE_SHEETS_URL;
      }
      if ((!merged.resendApiKey || merged.resendApiKey.startsWith('your_') || merged.resendApiKey.includes('test')) && (process.env.RE_API || process.env.RESEND_API_KEY)) {
        merged.resendApiKey = process.env.RE_API || process.env.RESEND_API_KEY;
      }
      if (!merged.resendAudienceId && process.env.RESEND_AUDIENCE_ID) {
        merged.resendAudienceId = process.env.RESEND_AUDIENCE_ID;
      }
      if ((!merged.apiKey || merged.apiKey.startsWith('your_')) && process.env.GEMINI_API_KEY) {
        merged.apiKey = process.env.GEMINI_API_KEY;
      }
      return merged;
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

// Helper: Build Resend API auth headers
function resendHeaders(apiKey) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': 'ThingSource/1.0'
  };
}

// Helper: Load subscribers
// Priority: 1) Google Sheets  2) Resend Contacts  3) Local JSON
async function getSubscribersList(settings) {
  const sheetsUrl = settings.googleSheetsUrl || process.env.GOOGLE_SHEETS_URL;
  if (sheetsUrl) {
    try {
      console.log(`[Subscribers] Fetching list from Google Sheets: ${sheetsUrl}`);
      const response = await fetch(sheetsUrl);
      if (response.ok) {
        return await response.json();
      }
      console.error(`[Subscribers] Failed to fetch from Google Sheets: ${response.status}`);
    } catch (err) {
      console.error(`[Subscribers] Error connecting to Google Sheets:`, err.message);
    }
  }

  // Resend Contacts API
  const resendKey = settings.resendApiKey;
  const audienceId = settings.resendAudienceId;
  if (resendKey && audienceId) {
    try {
      console.log(`[Subscribers] Fetching contacts from Resend Audience: ${audienceId}`);
      const response = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        headers: resendHeaders(resendKey)
      });
      if (response.ok) {
        const data = await response.json();
        const contacts = (data.data || data.contacts || []);
        // Return only subscribed contacts mapped to { email, date } shape
        return contacts
          .filter(c => !c.unsubscribed)
          .map(c => ({ email: c.email, date: c.created_at || new Date().toISOString() }));
      }
      console.error(`[Subscribers] Resend Contacts fetch failed: ${response.status} ${await response.text()}`);
    } catch (err) {
      console.error(`[Subscribers] Error connecting to Resend Contacts API:`, err.message);
    }
  }
  
  // Local fallback
  if (fs.existsSync(subscribersPath)) {
    try {
      return JSON.parse(fs.readFileSync(subscribersPath, 'utf8'));
    } catch (e) {
      console.error("Error reading subscribers file:", e);
    }
  }
  return [];
}

// Helper: Add subscriber
// Priority: 1) Google Sheets  2) Resend Contacts  3) Local JSON
async function addSubscriber(email, settings) {
  const trimmed = email.trim().toLowerCase();
  const sheetsUrl = settings.googleSheetsUrl || process.env.GOOGLE_SHEETS_URL;
  
  if (sheetsUrl) {
    try {
      console.log(`[Subscribers] Adding subscriber to Google Sheets: ${trimmed}`);
      const response = await fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, action: 'subscribe' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP error ${response.status}`);
      }
      return { success: true };
    } catch (err) {
      console.error(`[Subscribers] Google Sheets save failed:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // Resend Contacts API
  const resendKey = settings.resendApiKey;
  const audienceId = settings.resendAudienceId;
  if (resendKey && audienceId) {
    try {
      console.log(`[Subscribers] Adding contact to Resend Audience: ${trimmed}`);
      const response = await fetch('https://api.resend.com/contacts', {
        method: 'POST',
        headers: resendHeaders(resendKey),
        body: JSON.stringify({
          email: trimmed,
          audienceId,
          unsubscribed: false
        })
      });
      const data = await response.json();
      if (!response.ok) {
        // 409 = already exists — treat as success
        if (response.status === 409) {
          return { success: true };
        }
        throw new Error(data.message || data.error || `HTTP error ${response.status}`);
      }
      console.log(`[Subscribers] Resend contact created: ${data.id}`);
      return { success: true };
    } catch (err) {
      console.error(`[Subscribers] Resend Contacts add failed:`, err.message);
      return { success: false, error: err.message };
    }
  }
  
  // Local fallback
  let subscribers = [];
  if (fs.existsSync(subscribersPath)) {
    try {
      subscribers = JSON.parse(fs.readFileSync(subscribersPath, 'utf8'));
    } catch (e) {
      console.error("Error reading subscribers database:", e);
    }
  }
  if (subscribers.some(sub => sub.email === trimmed)) {
    return { success: false, error: "Already subscribed!" };
  }
  subscribers.push({ email: trimmed, date: new Date().toISOString() });
  fs.writeFileSync(subscribersPath, JSON.stringify(subscribers, null, 2), 'utf8');
  return { success: true };
}

// Helper: Remove subscriber
// Priority: 1) Google Sheets  2) Resend Contacts  3) Local JSON
async function removeSubscriber(email, settings) {
  const trimmed = email.trim().toLowerCase();
  const sheetsUrl = settings.googleSheetsUrl || process.env.GOOGLE_SHEETS_URL;
  
  if (sheetsUrl) {
    try {
      console.log(`[Subscribers] Removing subscriber from Google Sheets: ${trimmed}`);
      const response = await fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, action: 'unsubscribe' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP error ${response.status}`);
      }
      return { success: true };
    } catch (err) {
      console.error(`[Subscribers] Google Sheets remove failed:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // Resend Contacts API
  const resendKey = settings.resendApiKey;
  const audienceId = settings.resendAudienceId;
  if (resendKey && audienceId) {
    try {
      console.log(`[Subscribers] Unsubscribing contact from Resend Audience: ${trimmed}`);
      // PATCH to mark as unsubscribed (non-destructive) using email as identifier
      const response = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts/${encodeURIComponent(trimmed)}`, {
        method: 'PATCH',
        headers: resendHeaders(resendKey),
        body: JSON.stringify({ unsubscribed: true })
      });
      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || `HTTP error ${response.status}`);
      }
      return { success: true };
    } catch (err) {
      console.error(`[Subscribers] Resend Contacts remove failed:`, err.message);
      return { success: false, error: err.message };
    }
  }
  
  // Local fallback
  if (fs.existsSync(subscribersPath)) {
    try {
      let subscribers = JSON.parse(fs.readFileSync(subscribersPath, 'utf8'));
      const initialLength = subscribers.length;
      subscribers = subscribers.filter(sub => sub.email !== trimmed);
      if (subscribers.length === initialLength) {
        return { success: false, error: "Subscriber not found." };
      }
      fs.writeFileSync(subscribersPath, JSON.stringify(subscribers, null, 2), 'utf8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: "No subscribers found." };
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
  const subscribers = await getSubscribersList(settings);

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

// Sync public/config.json on startup
function syncPublicConfig() {
  const settings = getSettings();
  const configPath = path.join(publicDir, 'config.json');
  
  const newConfig = {
    googleSheetsUrl: settings.googleSheetsUrl || '',
    resendAudienceId: settings.resendAudienceId || '',
    // Only expose the API key if an audience is configured (safe to expose for contact creation only)
    resendApiKey: (settings.resendAudienceId && settings.resendApiKey) ? settings.resendApiKey : ''
  };

  let currentConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      // ignore
    }
  }
  
  const changed = JSON.stringify(currentConfig) !== JSON.stringify(newConfig);
  if (changed) {
    try {
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
      console.log(`[Startup] Synced public/config.json (Sheets: ${newConfig.googleSheetsUrl ? 'yes' : 'no'}, Resend Audience: ${newConfig.resendAudienceId ? 'yes' : 'no'})`);
    } catch (err) {
      console.error("[Startup] Failed to sync public/config.json:", err);
    }
  }
}

// Start Cron Scheduler and sync config on startup
setupCronSchedule();
syncPublicConfig();

// GET: Unsubscribe Route
app.get('/unsubscribe', async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).send('<h1>Error</h1><p>Email parameter is missing.</p>');
  }
  
  const settings = getSettings();
  const result = await removeSubscriber(email, settings);
  if (result.success) {
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
  } else {
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
          <h1>Error</h1>
          <p>${result.error || 'Email was not found in subscribers list.'}</p>
        </div>
      </body>
      </html>
    `);
  }
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
app.delete('/api/posts/:id', adminAuth, (req, res) => {
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
app.get('/api/status', adminAuth, (req, res) => {
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
app.post('/api/run-agent', adminAuth, (req, res) => {
  const { topic } = req.body;
  if (agentState.isRunning) {
    return res.status(409).json({ error: "Agent is already running." });
  }

  // Trigger asynchronously
  executeAgentRun(topic || null);
  
  res.json({ success: true, message: "Agent run started in background." });
});

// API: Get Current Settings (excluding sensitive API key characters in responses, but we can return length/status)
app.get('/api/settings', adminAuth, (req, res) => {
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
    resendSender: settings.resendSender || 'onboarding@resend.dev',
    resendAudienceId: settings.resendAudienceId || '',
    googleSheetsUrl: settings.googleSheetsUrl || ''
  });
});

// API: Update Settings
app.post('/api/settings', adminAuth, (req, res) => {
  const { apiKey, cronSchedule, topicsQueue, webhookUrl, webhookSecret, resendApiKey, resendSender, resendAudienceId, googleSheetsUrl } = req.body;
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
  if (resendAudienceId !== undefined) {
    currentSettings.resendAudienceId = resendAudienceId.trim();
  }
  if (googleSheetsUrl !== undefined) {
    currentSettings.googleSheetsUrl = googleSheetsUrl.trim();
    // Write public config.json for static frontend
    try {
      const configPath = path.join(publicDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ googleSheetsUrl: currentSettings.googleSheetsUrl }, null, 2), 'utf8');
      console.log(`[Settings] Updated public/config.json with Google Sheets URL.`);
    } catch (err) {
      console.error("Failed to write public/config.json:", err);
    }
  }

  saveSettings(currentSettings);
  
  // Re-initialize cron schedule
  setupCronSchedule();

  res.json({ success: true, message: "Settings updated successfully." });
});

// API: Publish Post to Webhook (Manual Trigger)
app.post('/api/posts/:id/publish', adminAuth, async (req, res) => {
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
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  const settings = getSettings();
  const result = await addSubscriber(email, settings);
  if (result.success) {
    res.json({ success: true, message: "Subscription successful!" });
  } else {
    res.status(500).json({ error: result.error || "Subscription failed." });
  }
});

// API: Get Subscribers List (Admin)
app.get('/api/subscribers', adminAuth, async (req, res) => {
  const settings = getSettings();
  const list = await getSubscribersList(settings);
  res.json(list);
});

// API: Unsubscribe (Admin or Link)
app.delete('/api/subscribers', adminAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email parameter required." });
  }

  const settings = getSettings();
  const result = await removeSubscriber(email, settings);
  if (result.success) {
    return res.json({ success: true, message: "Unsubscribed successfully." });
  } else {
    return res.status(500).json({ error: result.error || "Failed to unsubscribe." });
  }
});

app.listen(PORT, () => {
  console.log(`ThingSource Web Server listening on http://localhost:${PORT}`);
});
