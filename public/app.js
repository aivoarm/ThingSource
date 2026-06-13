// Public Blog State
let state = {
  posts: []
};

// Cache DOM Elements
const latestPostContainer = document.getElementById('latest-post-container');
const postsGrid = document.getElementById('posts-grid');
const readerModal = document.getElementById('reader-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalContent = document.getElementById('modal-content');
const formSubscribe = document.getElementById('form-subscribe');
const inputSubscribeEmail = document.getElementById('input-subscribe-email');

// Image fallback handler
function handleImageError(img) {
  const fallbacks = [
    "https://images.unsplash.com/photo-1507842217343-583bb7270b66?q=80&w=800", // Library/History
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800", // Science/Invention
    "https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=800", // Coffee/Food
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=800"  // Generic/Culture
  ];
  img.onerror = null; // prevent infinite loop
  img.src = fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadPosts();
  loadSubscriberCount();
});

function initEventListeners() {
  if (formSubscribe) {
    formSubscribe.addEventListener('submit', handleSubscribeNewsletter);
  }
}

// Fetch subscriber count
async function loadSubscriberCount() {
  try {
    const res = await fetch('/.netlify/functions/count');
    if (res.ok) {
      const data = await res.json();
      const countVal = document.getElementById('subscriber-count-val');
      if (countVal) countVal.textContent = data.count;
    }
  } catch (err) {
    console.error("Failed to load count:", err);
  }
}

// Load Posts from Static file posts.json
async function loadPosts() {
  try {
    const response = await fetch('/posts.json');
    if (!response.ok) throw new Error("Failed to load blog posts.");
    state.posts = await response.json();
    renderBlog();
  } catch (err) {
    console.error("Error loading blog posts:", err);
    if (postsGrid) {
      postsGrid.innerHTML = `<p class="error-msg">Error loading discoveries: ${err.message}</p>`;
    }
  }
}

// Render Blog Feed
function renderBlog() {
  if (state.posts.length === 0) {
    if (latestPostContainer) {
      latestPostContainer.className = "hero-post-card";
      latestPostContainer.innerHTML = `
        <div style="text-align: center; padding: 4rem 2rem; width: 100%;">
          <h3 style="font-family: var(--font-serif); font-size: 1.5rem;">No Discoveries Yet</h3>
          <p>The research agent hasn't compiled any articles yet. Stay tuned!</p>
        </div>
      `;
    }
    if (postsGrid) postsGrid.innerHTML = '';
    return;
  }

  // Render Latest Post (Hero)
  const latest = state.posts[0];
  const dateStr = new Date(latest.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  
  // Construct dynamic Unsplash Source URL using post keywords + category
  const keyword = latest.imageKeywords?.[0] || latest.topic || 'history';
  const categoryWord = latest.category || '';
  const unsplashUrl = `https://source.unsplash.com/800x500/?${encodeURIComponent(keyword)},${encodeURIComponent(categoryWord)}`;

  if (latestPostContainer) {
    latestPostContainer.className = "hero-post-card";
    latestPostContainer.innerHTML = `
      <div class="hero-image-wrapper">
        <img src="${unsplashUrl}" alt="${latest.title}" onerror="handleImageError(this)">
      </div>
      <div class="hero-content">
        <div>
          <span class="badge" style="margin-bottom: 0.75rem;">${latest.category || 'Discovery'}</span>
        </div>
        <h2 class="hero-title">${escapeHtml(latest.title)}</h2>
        <p class="hero-summary">${escapeHtml(latest.summary)}</p>
        <div class="post-meta">
          <span>📅 ${dateStr}</span>
          <span>🔍 Topic: ${escapeHtml(latest.topic)}</span>
        </div>
        <div class="hero-actions" style="margin-top: 1rem;">
          <button class="btn btn-primary" onclick="openPost('${latest.id}')">Read Full Article</button>
        </div>
      </div>
    `;
  }

  // Render Grid of older posts
  const older = state.posts.slice(1);
  if (!postsGrid) return;
  
  if (older.length === 0) {
    postsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">More discoveries will appear here as research continues.</div>`;
    return;
  }

  postsGrid.innerHTML = older.map(post => {
    const pDate = new Date(post.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const kw = post.imageKeywords?.[0] || post.topic || 'history';
    const cat = post.category || '';
    const thumbUrl = `https://source.unsplash.com/800x500/?${encodeURIComponent(kw)},${encodeURIComponent(cat)}`;
    
    return `
      <div class="post-card" onclick="openPost('${post.id}')">
        <div class="post-card-img-wrapper">
          <img src="${thumbUrl}" alt="${post.title}" loading="lazy" onerror="handleImageError(this)">
        </div>
        <div class="post-card-content">
          <div>
            <span class="badge" style="background-color: var(--accent-teal); font-size: 0.7rem; padding: 0.25rem 0.6rem;">${post.category || 'Discovery'}</span>
          </div>
          <h3 class="post-card-title">${escapeHtml(post.title)}</h3>
          <p class="post-card-excerpt">${escapeHtml(post.summary)}</p>
          <div class="post-card-meta">
            <span>📅 ${pDate}</span>
            <a href="javascript:void(0)">Read more &rarr;</a>
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
  const kw = post.imageKeywords?.[0] || post.topic || 'history';
  const cat = post.category || '';
  const coverImage = `https://source.unsplash.com/800x500/?${encodeURIComponent(kw)},${encodeURIComponent(cat)}`;
  
  // Render Markdown sections using marked.js
  const renderedSections = post.sections.map(sec => `
    <h3>${escapeHtml(sec.heading)}</h3>
    <p>${marked.parse(sec.content)}</p>
  `).join('');

  // Fun facts
  const factsHtml = post.funFacts && post.funFacts.length > 0 
    ? `
      <div class="fun-facts-box">
        <h4>Did you know?</h4>
        <ul>
          ${post.funFacts.map(fact => `<li>${escapeHtml(fact)}</li>`).join('')}
        </ul>
      </div>
    ` : '';

  // Citations
  const citationsHtml = post.citations && post.citations.length > 0
    ? `
      <div class="citations-box">
        <strong>Sources & Citations:</strong>
        <ul>
          ${post.citations.map(link => `
            <li>
              <a href="${link}" target="_blank" rel="noopener noreferrer">${escapeHtml(link)}</a>
            </li>
          `).join('')}
        </ul>
      </div>
    ` : '';

  modalContent.innerHTML = `
    <div class="post-detail-container">
      <div style="margin-bottom: 1.5rem;">
        <span class="badge">${post.category || 'Discovery'}</span>
      </div>
      <h1 class="post-detail-title">${escapeHtml(post.title)}</h1>
      <div class="post-detail-meta">
        <span>📅 ${dateStr}</span>
        <span>🔍 Topic: ${escapeHtml(post.topic)}</span>
      </div>
      <img class="post-detail-hero-image" src="${coverImage}" alt="${post.title}" onerror="handleImageError(this)">
      <div class="post-detail-body">
        ${renderedSections}
      </div>
      ${factsHtml}
      ${citationsHtml}
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

// Handle Subscription form submit
async function handleSubscribeNewsletter(e) {
  e.preventDefault();
  const email = inputSubscribeEmail.value.trim();
  if (!email) return;

  const submitBtn = formSubscribe.querySelector('.subscribe-btn');
  submitBtn.disabled = true;
  const originalText = submitBtn.innerText;
  submitBtn.innerText = 'Subscribing...';

  try {
    const response = await fetch('/.netlify/functions/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    if (response.ok) {
      document.getElementById('subscribe-form-container').innerHTML = `
        <div class="subscribe-success-msg">You're in! Check your inbox for a welcome email.</div>
      `;
      const valEl = document.getElementById('subscriber-count-val');
      if (valEl) {
        const curVal = parseInt(valEl.textContent);
        if (!isNaN(curVal)) valEl.textContent = curVal + 1;
      }
    } else {
      alert(data.message || data.error);
    }
  } catch (err) {
    alert("Failed to subscribe. Please try again.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalText;
    }
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
