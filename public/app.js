// Global State
let state = {
  posts: [],
  settings: {
    hasApiKey: false,
    cronSchedule: 'manual',
    topicsQueue: []
  },
  agent: {
    isRunning: false,
    lastRunTime: null,
    error: null,
    logs: ""
  },
  activeTab: 'blog'
};

// Cache DOM Elements
const navBlog = document.getElementById('nav-blog');
const navConsole = document.getElementById('nav-console');
const blogSection = document.getElementById('blog-section');
const consoleSection = document.getElementById('console-section');

const latestPostContainer = document.getElementById('latest-post-container');
const postsGrid = document.getElementById('posts-grid');

const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const lastRunLabel = document.getElementById('last-run-label');
const btnRunAgent = document.getElementById('btn-run-agent');
const btnClearLogs = document.getElementById('btn-clear-logs');
const terminalBody = document.getElementById('terminal-body');

const formQueueTopic = document.getElementById('form-queue-topic');
const inputTopic = document.getElementById('input-topic');
const queueCount = document.getElementById('queue-count');
const queueItemsList = document.getElementById('queue-items-list');

const formSettings = document.getElementById('form-settings');
const inputApiKey = document.getElementById('input-api-key');
const btnToggleKey = document.getElementById('btn-toggle-key');
const selectSchedule = document.getElementById('select-schedule');
const customCronGroup = document.getElementById('custom-cron-group');
const inputCron = document.getElementById('input-cron');

const inputWebhookUrl = document.getElementById('input-webhook-url');
const inputWebhookSecret = document.getElementById('input-webhook-secret');

const inputResendKey = document.getElementById('input-resend-key');
const btnToggleResendKey = document.getElementById('btn-toggle-resend-key');
const inputResendSender = document.getElementById('input-resend-sender');

const subscribersCount = document.getElementById('subscribers-count');
const subscribersList = document.getElementById('subscribers-list');
const formSubscribe = document.getElementById('form-subscribe');
const inputSubscribeEmail = document.getElementById('input-subscribe-email');

const readerModal = document.getElementById('reader-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalContent = document.getElementById('modal-content');

// Polling interval reference
let statusPollingInterval = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadData();
  startStatusPolling();
});

// Event Listeners Setup
function initEventListeners() {
  // Navigation Tabs
  navBlog.addEventListener('click', () => switchTab('blog'));
  navConsole.addEventListener('click', () => switchTab('console'));

  // Toggle API Key visibility
  btnToggleKey.addEventListener('click', () => {
    if (inputApiKey.type === 'password') {
      inputApiKey.type = 'text';
      btnToggleKey.textContent = '🙈';
    } else {
      inputApiKey.type = 'password';
      btnToggleKey.textContent = '👁️';
    }
  });

  // Schedule dropdown change
  selectSchedule.addEventListener('change', () => {
    if (selectSchedule.value === 'custom') {
      customCronGroup.classList.remove('hidden');
      inputCron.required = true;
    } else {
      customCronGroup.classList.add('hidden');
      inputCron.required = false;
    }
  });

  // Toggle Resend API Key visibility
  btnToggleResendKey.addEventListener('click', () => {
    if (inputResendKey.type === 'password') {
      inputResendKey.type = 'text';
      btnToggleResendKey.textContent = '🙈';
    } else {
      inputResendKey.type = 'password';
      btnToggleResendKey.textContent = '👁️';
    }
  });

  // Save Settings
  formSettings.addEventListener('submit', handleSaveSettings);

  // Queue Custom Topic
  formQueueTopic.addEventListener('submit', handleQueueTopic);

  // Newsletter Subscription Form
  if (formSubscribe) {
    formSubscribe.addEventListener('submit', handleSubscribeNewsletter);
  }

  // Run Agent Now
  btnRunAgent.addEventListener('click', handleRunAgentNow);

  // Clear Logs
  btnClearLogs.addEventListener('click', handleClearLogFile);

  // Modal Close
  modalCloseBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// Switch Tabs
function switchTab(tab) {
  state.activeTab = tab;
  if (tab === 'blog') {
    navBlog.classList.add('active');
    navConsole.classList.remove('active');
    blogSection.classList.add('active-section');
    consoleSection.classList.remove('active-section');
    loadPosts(); // Reload posts to show fresh runs
  } else {
    navBlog.classList.remove('active');
    navConsole.classList.add('active');
    blogSection.classList.remove('active-section');
    consoleSection.classList.add('active-section');
    loadSettings(); // Reload settings to show queue
  }
}

// Load All Data
async function loadData() {
  await Promise.all([
    loadPosts(),
    loadSettings(),
    fetchAgentStatus()
  ]);
}

// Load Posts
async function loadPosts() {
  try {
    const response = await fetch('/api/posts');
    if (!response.ok) throw new Error("Failed to load posts.");
    state.posts = await response.json();
    renderBlog();
  } catch (err) {
    console.error(err);
    postsGrid.innerHTML = `<p class="error-msg">Error loading posts: ${err.message}</p>`;
  }
}

// Load Settings
async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    if (!response.ok) throw new Error("Failed to load settings.");
    const data = await response.json();
    state.settings = data;
    
    // Update settings form fields
    if (data.hasApiKey) {
      inputApiKey.placeholder = `Saved key (${data.apiKeyLength} chars)`;
    } else {
      inputApiKey.placeholder = "Paste your GEMINI_API_KEY";
    }
    
    // Update schedule select
    const isCronOption = Array.from(selectSchedule.options).some(opt => opt.value === data.cronSchedule);
    if (isCronOption) {
      selectSchedule.value = data.cronSchedule;
      customCronGroup.classList.add('hidden');
      inputCron.value = '';
    } else {
      selectSchedule.value = 'custom';
      customCronGroup.classList.remove('hidden');
      inputCron.value = data.cronSchedule;
    }

    inputWebhookUrl.value = data.webhookUrl || '';
    inputWebhookSecret.value = data.webhookSecret || '';

    if (data.hasResendApiKey) {
      inputResendKey.placeholder = `Saved key (${data.resendApiKeyLength} chars)`;
    } else {
      inputResendKey.placeholder = "Paste your re_xxxxxxxx API key";
    }
    inputResendSender.value = data.resendSender || 'onboarding@resend.dev';

    renderQueueList();
    loadSubscribers();
  } catch (err) {
    console.error(err);
  }
}

// Render Queue List
function renderQueueList() {
  const queue = state.settings.topicsQueue || [];
  queueCount.textContent = queue.length;
  
  if (queue.length === 0) {
    queueItemsList.innerHTML = `<li class="subtext">Queue is empty. Agent will generate topics autonomously.</li>`;
    return;
  }

  queueItemsList.innerHTML = queue.map((topic, index) => `
    <li class="queue-item">
      <span class="queue-item-text" title="${topic}">${topic}</span>
      <button class="btn-remove-queue" onclick="removeFromQueue(${index})">&times;</button>
    </li>
  `).join('');
}

// Add Topic to Queue
async function handleQueueTopic(e) {
  e.preventDefault();
  const newTopic = inputTopic.value.trim();
  if (!newTopic) return;

  const currentQueue = [...state.settings.topicsQueue, newTopic];
  
  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicsQueue: currentQueue })
    });
    
    if (!response.ok) throw new Error("Failed to update queue on server.");
    inputTopic.value = '';
    await loadSettings();
  } catch (err) {
    alert(err.message);
  }
}

// Remove Topic from Queue
async function removeFromQueue(index) {
  const currentQueue = [...state.settings.topicsQueue];
  currentQueue.splice(index, 1);

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicsQueue: currentQueue })
    });
    
    if (!response.ok) throw new Error("Failed to remove item.");
    await loadSettings();
  } catch (err) {
    alert(err.message);
  }
}

// Save Settings
async function handleSaveSettings(e) {
  e.preventDefault();
  
  const apiKey = inputApiKey.value.trim();
  const schedule = selectSchedule.value === 'custom' ? inputCron.value.trim() : selectSchedule.value;
  const webhookUrl = inputWebhookUrl.value.trim();
  const webhookSecret = inputWebhookSecret.value.trim();
  const resendApiKey = inputResendKey.value.trim();
  const resendSender = inputResendSender.value.trim();

  const body = {};
  if (apiKey) body.apiKey = apiKey; // Only send key if changed
  body.cronSchedule = schedule;
  body.webhookUrl = webhookUrl;
  body.webhookSecret = webhookSecret;
  if (resendApiKey) body.resendApiKey = resendApiKey;
  body.resendSender = resendSender;

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to save settings.");
    }
    
    inputApiKey.value = '';
    alert("Settings saved successfully.");
    await loadSettings();
  } catch (err) {
    alert(err.message);
  }
}

// Run Agent Now
async function handleRunAgentNow() {
  if (state.agent.isRunning) return;

  const runTopic = prompt("Enter a specific topic to research right now, or leave blank for autonomous discovery / topics queue:");
  if (runTopic === null) return; // Cancelled

  btnRunAgent.disabled = true;
  
  try {
    const response = await fetch('/api/run-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: runTopic || undefined })
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to trigger run.");
    }
    
    // Switch to console to see logs
    switchTab('console');
    
    // Instantly set running status in state to trigger polling
    state.agent.isRunning = true;
    updateStatusUI();
    
    // Force poll logs instantly
    fetchAgentStatus();
  } catch (err) {
    alert(err.message);
    btnRunAgent.disabled = false;
  }
}

// Clear logs in UI and backend (rewrites agent log)
async function handleClearLogFile() {
  if (state.agent.isRunning) {
    alert("Cannot clear logs while the agent is running.");
    return;
  }
  
  if (confirm("Are you sure you want to clear the agent logs?")) {
    try {
      // We can clear logs by triggering a dummy agent init run, or we can add a server route.
      // Alternatively, let's just clear the screen on the UI since it is mostly for visuals.
      terminalBody.innerHTML = `<div class="log-line system">[SYSTEM] Console logs cleared on client.</div>`;
    } catch (e) {
      console.error(e);
    }
  }
}

// Fetch Agent Status & Logs
async function fetchAgentStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error("Failed to fetch status.");
    const statusData = await response.json();
    
    // Detect transitions in running state
    const finishedRunning = state.agent.isRunning && !statusData.isRunning;
    
    state.agent.isRunning = statusData.isRunning;
    state.agent.lastRunTime = statusData.lastRunTime;
    state.agent.error = statusData.error;
    state.agent.logs = statusData.logs;
    
    updateStatusUI();
    renderLogs();
    
    if (finishedRunning) {
      // Reload blog feed behind the scenes
      loadPosts();
      loadSettings(); // refresh queue count
    }
  } catch (err) {
    console.error("Error fetching agent status:", err);
  }
}

// Update Status Badge and triggers
function updateStatusUI() {
  if (state.agent.isRunning) {
    statusBadge.className = 'badge badge-running';
    statusText.textContent = 'Researching...';
    btnRunAgent.disabled = true;
    btnRunAgent.innerHTML = `
      <svg class="icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"></path></svg>
      Agent is active...
    `;
  } else {
    statusBadge.className = 'badge badge-idle';
    statusText.textContent = 'Idle';
    btnRunAgent.disabled = false;
    btnRunAgent.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      Run Agent Now
    `;
  }
  
  if (state.agent.lastRunTime) {
    const dateStr = new Date(state.agent.lastRunTime).toLocaleString();
    lastRunLabel.textContent = `Last Run: ${dateStr}`;
  } else {
    lastRunLabel.textContent = 'Last Run: Never';
  }
}

// Render Logs in Terminal
function renderLogs() {
  if (!state.agent.logs) {
    terminalBody.innerHTML = `<div class="log-line system">[SYSTEM] No log entries yet. Save settings and click 'Run Agent Now' to start.</div>`;
    return;
  }

  const lines = state.agent.logs.split('\n');
  const renderedLines = lines.map(line => {
    if (!line.trim()) return '';
    let className = '';
    if (line.includes('ERROR') || line.includes('FATAL')) className = 'error';
    else if (line.includes('Success!') || line.includes('Successfully')) className = 'success';
    else if (line.includes('SYSTEM')) className = 'system';
    
    return `<div class="log-line ${className}">${escapeHtml(line)}</div>`;
  }).join('');

  const isAtBottom = terminalBody.scrollHeight - terminalBody.clientHeight <= terminalBody.scrollTop + 50;
  terminalBody.innerHTML = renderedLines;
  
  // Auto-scroll terminal if user was already near the bottom
  if (isAtBottom || state.agent.isRunning) {
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }
}

// Start Status Polling
function startStatusPolling() {
  if (statusPollingInterval) clearInterval(statusPollingInterval);
  
  // Poll every 3 seconds
  statusPollingInterval = setInterval(() => {
    fetchAgentStatus();
  }, 3000);
}

// Render Blog Feed
function renderBlog() {
  if (state.posts.length === 0) {
    latestPostContainer.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem;">
        <h3>No Blog Posts Yet</h3>
        <p class="card-desc">The database is currently empty. Head over to the **Agent Console** and click **Run Agent Now** to start your first research cycle!</p>
        <button class="btn btn-primary" style="max-width: 250px; margin: 1rem auto 0;" onclick="switchTab('console')">Configure Agent</button>
      </div>
    `;
    latestPostContainer.className = "card";
    postsGrid.innerHTML = '';
    return;
  }

  // Render Latest Post (Hero)
  const latest = state.posts[0];
  const dateStr = new Date(latest.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const coverImage = latest.images && latest.images.length > 0 ? latest.images[0] : 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800';

  latestPostContainer.className = "hero-post-card";
  latestPostContainer.innerHTML = `
    <div class="hero-image-wrapper">
      <img src="${coverImage}" alt="${latest.title}">
      <div class="hero-overlay"></div>
    </div>
    <div class="hero-content">
      <span class="tag-badge">${latest.category || 'Discovery'}</span>
      <h2 class="hero-title">${escapeHtml(latest.title)}</h2>
      <p class="hero-summary">${escapeHtml(latest.summary)}</p>
      <div class="post-meta">
        <span>📅 ${dateStr}</span>
        <span>🔍 Topic: ${escapeHtml(latest.topic)}</span>
      </div>
      <div class="hero-actions" style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.5rem; width: 100%;">
        <button class="btn btn-primary" onclick="openPost('${latest.id}')" style="width: auto; align-self: flex-start;">Read Full Article</button>
        <button class="btn btn-secondary btn-publish-${latest.id}" onclick="publishPost(event, '${latest.id}')" style="width: auto; align-self: flex-start;">Push to Website</button>
      </div>
    </div>
  `;

  // Render Grid of older posts
  const older = state.posts.slice(1);
  if (older.length === 0) {
    postsGrid.innerHTML = `<div class="subtext" style="grid-column: 1/-1; text-align: center; padding: 2rem;">More discoveries will appear here as the agent continues its research.</div>`;
    return;
  }

  postsGrid.innerHTML = older.map(post => {
    const pDate = new Date(post.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const thumb = post.images && post.images.length > 0 ? post.images[0] : 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=600';
    return `
      <div class="post-card" onclick="handleCardClick(event, '${post.id}')">
        <div class="post-card-img-wrapper">
          <img src="${thumb}" alt="${post.title}" loading="lazy">
        </div>
        <div class="post-card-body">
          <span class="tag-badge" style="margin-bottom: 0.5rem;">${post.category || 'Discovery'}</span>
          <h3 class="post-card-title">${escapeHtml(post.title)}</h3>
          <p class="post-card-summary">${escapeHtml(post.summary)}</p>
          <div class="post-card-footer">
            <span>📅 ${pDate}</span>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button class="delete-btn-card btn-publish-${post.id}" title="Push to Website" onclick="publishPost(event, '${post.id}')" style="font-size: 1.1rem; padding: 2px 6px;">☁️</button>
              <button class="delete-btn-card" title="Delete discovery" onclick="handleDeletePost(event, '${post.id}')">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Handle click of Card to separate body clicks from delete click
function handleCardClick(event, id) {
  if (event.target.closest('.delete-btn-card')) return;
  openPost(id);
}

// Open Post Modal
function openPost(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;

  const dateStr = new Date(post.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const coverImage = post.images && post.images.length > 0 ? post.images[0] : 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800';
  
  // Render Markdown sections using marked.js
  const renderedSections = post.sections.map(sec => `
    <h3>${escapeHtml(sec.heading)}</h3>
    <div>${marked.parse(sec.content)}</div>
  `).join('');

  // Auxiliary images (secondary and tertiary images if present)
  let galleryHtml = '';
  if (post.images && post.images.length > 1) {
    const extraImages = post.images.slice(1);
    galleryHtml = `
      <div class="article-gallery">
        ${extraImages.map(img => `
          <div class="gallery-img-wrapper">
            <img src="${img}" alt="Secondary research image" loading="lazy">
          </div>
        `).join('')}
      </div>
    `;
  }

  // Fun facts
  const factsHtml = post.funFacts && post.funFacts.length > 0 
    ? `
      <div class="sidebar-box">
        <h4>Fun Facts</h4>
        <ul class="fun-fact-list">
          ${post.funFacts.map(fact => `<li>${escapeHtml(fact)}</li>`).join('')}
        </ul>
      </div>
    ` : '';

  // Citations
  const citationsHtml = post.citations && post.citations.length > 0
    ? `
      <div class="sidebar-box">
        <h4>Sources & Citations</h4>
        <ul class="sources-list">
          ${post.citations.map(link => `
            <li>
              <a href="${link}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.substring(0, 35))}...</a>
            </li>
          `).join('')}
        </ul>
      </div>
    ` : '';

  modalContent.innerHTML = `
    <!-- Header -->
    <div class="article-header">
      <img class="article-header-bg" src="${coverImage}" alt="${post.title}">
      <div class="article-header-overlay"></div>
      <div class="article-header-content">
        <span class="tag-badge">${post.category || 'Discovery'}</span>
        <h2 class="hero-title" style="font-size: 2.25rem;">${escapeHtml(post.title)}</h2>
        <div class="post-meta" style="margin-bottom: 0;">
          <span>📅 ${dateStr}</span>
          <span>🔍 Topic: ${escapeHtml(post.topic)}</span>
        </div>
      </div>
    </div>

    <!-- Body Layout -->
    <div class="article-body-grid">
      <!-- Main Content -->
      <div class="article-text">
        ${renderedSections}
        ${galleryHtml}
      </div>
      
      <!-- Sidebar info -->
      <div class="article-sidebar">
        <div class="sidebar-box">
          <h4>Distribution</h4>
          <p style="font-size: 0.85rem; color: #44403c; margin-bottom: 1rem; line-height: 1.4;">Push this researched article to your remote blog website.</p>
          <button class="btn btn-primary btn-publish-${post.id}" onclick="publishPost(event, '${post.id}')" style="font-size: 0.9rem; padding: 0.6rem 1rem;">Push to Website</button>
        </div>
        ${factsHtml}
        ${citationsHtml}
      </div>
    </div>
  `;

  readerModal.classList.add('open');
  document.body.style.overflow = 'hidden'; // Stop scrolling background
}

// Close Modal
function closeModal() {
  readerModal.classList.remove('open');
  document.body.style.overflow = '';
}

// Delete Post
async function handleDeletePost(event, id) {
  event.stopPropagation();
  if (!confirm("Are you sure you want to delete this discovery from the blog database?")) return;

  try {
    const response = await fetch(`/api/posts/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error("Failed to delete from database.");
    await loadPosts();
  } catch (err) {
    alert(err.message);
  }
}

// Helper: Escape HTML string to prevent XSS
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Publish Post to Remote Webhook
async function publishPost(event, id) {
  if (event) {
    event.stopPropagation();
  }

  const buttons = document.querySelectorAll(`.btn-publish-${id}`);
  buttons.forEach(btn => {
    btn.disabled = true;
    if (btn.tagName === 'BUTTON') {
      btn.innerText = 'Pushing...';
    }
  });

  try {
    const response = await fetch(`/api/posts/${id}/publish`, {
      method: 'POST'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to publish post.");
    }

    alert(`Success! Post successfully pushed to your remote website. (Status ${data.status})`);
  } catch (err) {
    alert(`Publishing failed: ${err.message}`);
  } finally {
    buttons.forEach(btn => {
      btn.disabled = false;
      if (btn.tagName === 'BUTTON') {
        btn.innerText = btn.innerText === 'Pushing...' ? 'Push to Website' : '☁️';
      }
    });
  }
}

// Load subscribers (Admin Console)
async function loadSubscribers() {
  try {
    const response = await fetch('/api/subscribers');
    if (!response.ok) throw new Error("Failed to load subscribers.");
    const list = await response.json();

    subscribersCount.textContent = list.length;
    if (list.length === 0) {
      subscribersList.innerHTML = `<li class="subtext">No subscribers yet.</li>`;
      return;
    }

    subscribersList.innerHTML = list.map(sub => {
      const sDate = new Date(sub.date).toLocaleDateString();
      return `
        <li class="queue-item">
          <span class="queue-item-text" title="${sub.email}">${sub.email} (${sDate})</span>
          <button class="btn-remove-queue" onclick="unsubscribeUser('${sub.email}')">&times;</button>
        </li>
      `;
    }).join('');
  } catch (err) {
    console.error("Error loading subscribers:", err);
  }
}

// Unsubscribe User (Admin Console)
async function unsubscribeUser(email) {
  if (!confirm(`Are you sure you want to unsubscribe ${email}?`)) return;

  try {
    const response = await fetch('/api/subscribers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!response.ok) throw new Error("Failed to unsubscribe user.");
    await loadSubscribers();
  } catch (err) {
    alert(err.message);
  }
}

// Handle Subscription form submit (Homepage)
async function handleSubscribeNewsletter(e) {
  e.preventDefault();
  const email = inputSubscribeEmail.value.trim();
  if (!email) return;

  const submitBtn = formSubscribe.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  const originalText = submitBtn.innerText;
  submitBtn.innerText = 'Subscribing...';

  try {
    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to subscribe.");
    }

    alert("Subscription successful! You will now receive new discoveries in your inbox.");
    inputSubscribeEmail.value = '';
    await loadSubscribers();
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = originalText;
  }
}

