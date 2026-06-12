// Admin Dashboard State
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
  }
};

// Cache DOM Elements
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

const subscribersCount = document.getElementById('subscribers-count');
const subscribersList = document.getElementById('subscribers-list');
const adminPostsList = document.getElementById('admin-posts-list');

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
const inputAudienceId = document.getElementById('input-audience-id');
const inputSheetsUrl = document.getElementById('input-sheets-url');

let statusPollingInterval = null;

// Helper: Authenticated Fetch
async function fetchWithAuth(url, options = {}) {
  const password = localStorage.getItem('adminPassword') || '';
  if (!options.headers) {
    options.headers = {};
  }
  options.headers['X-Admin-Password'] = password;
  
  const response = await fetch(url, options);
  if (response.status === 401) {
    alert("Session unauthorized or password incorrect. Redirecting to login page.");
    localStorage.removeItem('adminPassword');
    window.location.href = '/admin';
    throw new Error("Unauthorized");
  }
  return response;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadData();
  startStatusPolling();
});

function initEventListeners() {
  // Toggle Gemini Key
  btnToggleKey.addEventListener('click', () => {
    inputApiKey.type = inputApiKey.type === 'password' ? 'text' : 'password';
    btnToggleKey.textContent = inputApiKey.type === 'password' ? '👁️' : '🙈';
  });

  // Toggle Resend Key
  btnToggleResendKey.addEventListener('click', () => {
    inputResendKey.type = inputResendKey.type === 'password' ? 'text' : 'password';
    btnToggleResendKey.textContent = inputResendKey.type === 'password' ? '👁️' : '🙈';
  });

  // Schedule dropdown change
  selectSchedule.addEventListener('change', () => {
    if (selectSchedule.value === 'custom') {
      customCronGroup.classList.remove('hidden');
      inputCron.required = true;
    } else {
      customCronGroup.classList.add('hidden');
      inputCron.required = false;
      inputCron.value = '';
    }
  });

  // Save Settings
  formSettings.addEventListener('submit', handleSaveSettings);

  // Queue Custom Topic
  formQueueTopic.addEventListener('submit', handleQueueTopic);

  // Run Agent Now
  btnRunAgent.addEventListener('click', handleRunAgentNow);

  // Clear Logs
  btnClearLogs.addEventListener('click', handleClearLogFile);

  // Logout Button
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      if (confirm("Are you sure you want to log out?")) {
        try {
          await fetch('/api/logout', { method: 'POST' });
          localStorage.removeItem('adminPassword');
          window.location.href = '/admin';
        } catch (err) {
          console.error("Logout failed:", err);
        }
      }
    });
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
    const response = await fetch('/posts.json');
    if (!response.ok) throw new Error("Failed to load posts.");
    state.posts = await response.json();
    renderPostsList();
  } catch (err) {
    console.error("Error loading posts:", err);
    adminPostsList.innerHTML = `<li class="subtext error">Error: ${err.message}</li>`;
  }
}

// Render Posts List in Admin
function renderPostsList() {
  if (state.posts.length === 0) {
    adminPostsList.innerHTML = `<li class="subtext">No articles generated yet.</li>`;
    return;
  }

  adminPostsList.innerHTML = state.posts.map(post => `
    <li class="queue-item" style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
      <span class="queue-item-text" title="${post.title}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; font-weight: 500;">
        ${post.title}
      </span>
      <div style="display: flex; gap: 0.25rem;">
        <button class="btn btn-secondary btn-publish-${post.id}" onclick="publishPost('${post.id}')" style="padding: 2px 8px; font-size: 0.8rem; width: auto;" title="Push to remote Website">☁️ Push</button>
        <button class="btn btn-secondary" onclick="deletePost('${post.id}')" style="padding: 2px 8px; font-size: 0.8rem; width: auto; background: rgba(220, 38, 38, 0.2); border-color: rgba(220, 38, 38, 0.4); color: #fca5a5;" title="Delete post">🗑️</button>
      </div>
    </li>
  `).join('');
}

// Delete Post
async function deletePost(id) {
  if (!confirm("Are you sure you want to delete this discovery?")) return;
  try {
    const response = await fetchWithAuth(`/api/posts/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error("Failed to delete post.");
    alert("Post deleted.");
    await loadPosts();
  } catch (err) {
    alert(err.message);
  }
}

// Push Post to Remote Webhook
async function publishPost(id) {
  const btn = document.querySelector(`.btn-publish-${id}`);
  if (btn) btn.disabled = true;
  try {
    const response = await fetchWithAuth(`/api/posts/${id}/publish`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to publish post.");
    alert(`Published successfully! (Status ${data.status})`);
  } catch (err) {
    alert(`Publishing failed: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Load Settings
async function loadSettings() {
  try {
    const response = await fetchWithAuth('/api/settings');
    if (!response.ok) throw new Error("Failed to load settings.");
    const data = await response.json();
    state.settings = data;
    
    // Update API Key placeholders
    inputApiKey.placeholder = data.hasApiKey ? `Saved key (${data.apiKeyLength} chars)` : "Paste your GEMINI_API_KEY";
    inputResendKey.placeholder = data.hasResendApiKey ? `Saved key (${data.resendApiKeyLength} chars)` : "Paste your re_xxxxxxxx API key";
    inputResendSender.value = data.resendSender || 'onboarding@resend.dev';

    // Update Schedule dropdown
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
    inputAudienceId.value = data.resendAudienceId || '';
    inputSheetsUrl.value = data.googleSheetsUrl || '';

    renderQueueList();
    loadSubscribers();
  } catch (err) {
    console.error("Error loading settings:", err);
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
    const response = await fetchWithAuth('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicsQueue: currentQueue })
    });
    if (!response.ok) throw new Error("Failed to update queue.");
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
    const response = await fetchWithAuth('/api/settings', {
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
  const resendAudienceId = inputAudienceId.value.trim();
  const googleSheetsUrl = inputSheetsUrl.value.trim();

  const body = {};
  if (apiKey) body.apiKey = apiKey;
  body.cronSchedule = schedule;
  body.webhookUrl = webhookUrl;
  body.webhookSecret = webhookSecret;
  if (resendApiKey) body.resendApiKey = resendApiKey;
  body.resendSender = resendSender;
  body.resendAudienceId = resendAudienceId;
  body.googleSheetsUrl = googleSheetsUrl;

  try {
    const response = await fetchWithAuth('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to save settings.");
    }
    
    inputApiKey.value = '';
    inputResendKey.value = '';
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
  if (runTopic === null) return;

  btnRunAgent.disabled = true;
  try {
    const response = await fetchWithAuth('/api/run-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: runTopic || undefined })
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Failed to trigger run.");
    }
    
    state.agent.isRunning = true;
    updateStatusUI();
    fetchAgentStatus();
  } catch (err) {
    alert(err.message);
    btnRunAgent.disabled = false;
  }
}

// Clear UI logs
async function handleClearLogFile() {
  if (state.agent.isRunning) {
    alert("Cannot clear logs while the agent is running.");
    return;
  }
  if (confirm("Are you sure you want to clear the logs view?")) {
    terminalBody.innerHTML = `<div class="log-line system">[SYSTEM] Console logs cleared.</div>`;
  }
}

// Fetch Agent Status & Logs
async function fetchAgentStatus() {
  try {
    const response = await fetchWithAuth('/api/status');
    if (!response.ok) throw new Error("Failed to fetch status.");
    const statusData = await response.json();
    
    const finishedRunning = state.agent.isRunning && !statusData.isRunning;
    
    state.agent.isRunning = statusData.isRunning;
    state.agent.lastRunTime = statusData.lastRunTime;
    state.agent.error = statusData.error;
    state.agent.logs = statusData.logs;
    
    updateStatusUI();
    renderLogs();
    
    if (finishedRunning) {
      loadPosts();
      loadSettings();
    }
  } catch (err) {
    console.error("Error fetching agent status:", err);
  }
}

// Update Status Badge
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
    lastRunLabel.textContent = `Last Run: ${new Date(state.agent.lastRunTime).toLocaleString()}`;
  } else {
    lastRunLabel.textContent = 'Last Run: Never';
  }
}

// Render Logs in Terminal
function renderLogs() {
  if (!state.agent.logs) return;

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
  
  if (isAtBottom || state.agent.isRunning) {
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }
}

// Load Subscribers
async function loadSubscribers() {
  try {
    const response = await fetchWithAuth('/api/subscribers');
    if (!response.ok) throw new Error("Failed to load subscribers.");
    const list = await response.json();

    subscribersCount.textContent = list.length;
    if (list.length === 0) {
      subscribersList.innerHTML = `<li class="subtext">No subscribers yet.</li>`;
      return;
    }

    subscribersList.innerHTML = list.map(sub => `
      <li class="queue-item">
        <span class="queue-item-text" title="${sub.email}">${sub.email}</span>
        <button class="btn-remove-queue" onclick="unsubscribeUser('${sub.email}')">&times;</button>
      </li>
    `).join('');
  } catch (err) {
    console.error("Error loading subscribers:", err);
  }
}

// Unsubscribe User
async function unsubscribeUser(email) {
  if (!confirm(`Are you sure you want to unsubscribe ${email}?`)) return;
  try {
    const response = await fetchWithAuth('/api/subscribers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!response.ok) throw new Error("Failed to unsubscribe.");
    await loadSubscribers();
  } catch (err) {
    alert(err.message);
  }
}

// Start Status Polling
function startStatusPolling() {
  if (statusPollingInterval) clearInterval(statusPollingInterval);
  statusPollingInterval = setInterval(fetchAgentStatus, 3000);
}

// Escape HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
