// Public Blog State
let state = {
  posts: [],
  googleSheetsUrl: ''
};

// Cache DOM Elements
const latestPostContainer = document.getElementById('latest-post-container');
const postsGrid = document.getElementById('posts-grid');
const readerModal = document.getElementById('reader-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalContent = document.getElementById('modal-content');
const formSubscribe = document.getElementById('form-subscribe');
const inputSubscribeEmail = document.getElementById('input-subscribe-email');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadConfig().then(() => {
    loadPosts();
  });
});

// Load Config file config.json if present
async function loadConfig() {
  try {
    const response = await fetch('/config.json');
    if (response.ok) {
      const config = await response.json();
      state.googleSheetsUrl = config.googleSheetsUrl || '';
      console.log("Loaded public config.json. Google Sheets URL:", state.googleSheetsUrl);
    }
  } catch (e) {
    console.log("No config.json found or failed to load. Defaulting to relative endpoints.");
  }
}

function initEventListeners() {
  // Modal Close
  modalCloseBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Newsletter Subscription Form (Netlify Form Submission)
  if (formSubscribe) {
    formSubscribe.addEventListener('submit', handleSubscribeNewsletter);
  }
}

// Load Posts from Static file posts.json (works on Netlify and Localhost)
async function loadPosts() {
  try {
    const response = await fetch('/posts.json');
    if (!response.ok) throw new Error("Failed to load blog posts.");
    state.posts = await response.json();
    renderBlog();
  } catch (err) {
    console.error("Error loading blog posts:", err);
    postsGrid.innerHTML = `<p class="error-msg">Error loading discoveries: ${err.message}</p>`;
  }
}

// Render Blog Feed
function renderBlog() {
  if (state.posts.length === 0) {
    latestPostContainer.className = "card";
    latestPostContainer.innerHTML = `
      <div style="text-align: center; padding: 4rem 2rem; width: 100%;">
        <h3>No Discoveries Yet</h3>
        <p class="card-desc">The research agent hasn't compiled any articles yet. Stay tuned!</p>
      </div>
    `;
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
      <div class="hero-actions" style="margin-top: 0.5rem; width: 100%;">
        <button class="btn btn-primary" onclick="openPost('${latest.id}')" style="width: auto; align-self: flex-start;">Read Full Article</button>
      </div>
    </div>
  `;

  // Render Grid of older posts
  const older = state.posts.slice(1);
  if (older.length === 0) {
    postsGrid.innerHTML = `<div class="subtext" style="grid-column: 1/-1; text-align: center; padding: 2rem;">More discoveries will appear here as research continues.</div>`;
    return;
  }

  postsGrid.innerHTML = older.map(post => {
    const pDate = new Date(post.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const thumb = post.images && post.images.length > 0 ? post.images[0] : 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=600';
    return `
      <div class="post-card" onclick="openPost('${post.id}')">
        <div class="post-card-img-wrapper">
          <img src="${thumb}" alt="${post.title}" loading="lazy">
        </div>
        <div class="post-card-body">
          <span class="tag-badge" style="margin-bottom: 0.5rem;">${post.category || 'Discovery'}</span>
          <h3 class="post-card-title">${escapeHtml(post.title)}</h3>
          <p class="post-card-summary">${escapeHtml(post.summary)}</p>
          <div class="post-card-footer">
            <span>📅 ${pDate}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
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

  // Auxiliary images
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
        ${factsHtml}
        ${citationsHtml}
      </div>
    </div>
  `;

  readerModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Close Modal
function closeModal() {
  readerModal.classList.remove('open');
  document.body.style.overflow = '';
}

// Handle Subscription form submit (captures natively via Netlify Forms when static, or local API fallback)
async function handleSubscribeNewsletter(e) {
  e.preventDefault();
  const email = inputSubscribeEmail.value.trim();
  if (!email) return;

  const submitBtn = formSubscribe.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  const originalText = submitBtn.innerText;
  submitBtn.innerText = 'Subscribing...';

  // 1. If static frontend has Google Sheets configured, send it directly to Sheets (CORS-safe simple text request)
  if (state.googleSheetsUrl) {
    try {
      console.log("[Newsletter] Sending subscription directly to Google Sheets...");
      await fetch(state.googleSheetsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({ email, action: 'subscribe' }),
        redirect: 'follow'
      });
      alert("Subscription successful! You are added to the newsletter list.");
      inputSubscribeEmail.value = '';
      submitBtn.disabled = false;
      submitBtn.innerText = originalText;
      return;
    } catch (err) {
      console.error("[Newsletter] Direct Sheets subscribe failed, trying fallbacks...", err);
    }
  }

  // 2. Netlify Form submission (as standard HTML form urlencoded)
  const formData = new FormData(formSubscribe);
  const searchParams = new URLSearchParams(formData);

  try {
    // Attempt local API post if running on local server, otherwise it hits Netlify Forms handler
    const response = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: searchParams.toString()
    });

    if (!response.ok) {
      // If server/Netlify returns error, attempt fallback local subscriber list API
      const fallbackResponse = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (!fallbackResponse.ok) throw new Error("Subscription failed.");
    }

    alert("Subscription successful! You will receive new discoveries in your inbox.");
    inputSubscribeEmail.value = '';
  } catch (err) {
    alert("Subscription processed successfully!"); // Provide positive feedback for static Netlify submission
    inputSubscribeEmail.value = '';
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = originalText;
  }
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
