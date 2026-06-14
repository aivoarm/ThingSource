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
    "https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?q=80&w=800", // Warm gold/vintage paper texture
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800", // Warm abstract paint shapes
    "https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?q=80&w=800", // Warm minimalist brush strokes
    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=800"  // Warm minimalist lines/light
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
        ${getPostImage(latest)}
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
          ${getPostImage(post)}
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
  
  // Build the static, beautiful inline ad card matching the site palette
  const inlineAdHtml = `
    <div class="inline-spotify-ad" style="
      background-color: #FFFFFF;
      border: 1px solid rgba(13, 122, 107, 0.15);
      border-left: 4px solid #0D7A6B; /* Deep Teal */
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.04);
    ">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #0D7A6B; letter-spacing: 1px;">
          Featured Spotlight
        </span>
        <span style="font-family: 'Inter', sans-serif; font-size: 10px; color: #1C1C1E; opacity: 0.4; text-transform: uppercase;">Sponsored</span>
      </div>
      <h4 style="font-family: 'Playfair Display', serif; font-size: 18px; margin: 0 0 6px 0; color: #1C1C1E;">
        Love exploring new vibes?
      </h4>
      <p style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.5; color: #1C1C1E; margin: 0 0 15px 0; opacity: 0.9;">
        Check out my official Spotify profile for fresh music streams, curated soundscapes, and regular sonic releases.
      </p>
      <a href="https://open.spotify.com/artist/1DukxxMpzFcNZx5iIJiSK4" 
         target="_blank" 
         rel="noopener noreferrer" 
         style="
           display: inline-block;
           background-color: #0D7A6B; /* Deep Teal */
           color: #F8F6F1; /* Warm Off-White */
           font-family: 'Inter', sans-serif;
           font-weight: 600;
           font-size: 12px;
           text-decoration: none;
           padding: 8px 16px;
           border-radius: 4px;
         ">
         Visit My Spotify Profile →
       </a>
       <div style="margin-top: 12px;">
         <a href="https://www.armanayva.com" target="_blank" rel="noopener noreferrer"
            style="font-family: 'Inter', sans-serif; font-size: 11px; color: #0D7A6B; text-decoration: none; opacity: 0.7;">
           armanayva.com ↗
         </a>
       </div>
     </div>
  `;

  // Render Markdown sections using marked.js, injecting the ad between section 1 and 2
  let renderedSections = "";
  if (post.sections.length > 0) {
    renderedSections += `
      <h3>${escapeHtml(post.sections[0].heading)}</h3>
      <p>${marked.parse(post.sections[0].content)}</p>
    `;
    if (post.sections.length > 1) {
      renderedSections += inlineAdHtml;
      for (let i = 1; i < post.sections.length; i++) {
        renderedSections += `
          <h3>${escapeHtml(post.sections[i].heading)}</h3>
          <p>${marked.parse(post.sections[i].content)}</p>
        `;
      }
    } else {
      renderedSections += inlineAdHtml;
    }
  } else {
    renderedSections = inlineAdHtml;
  }

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

  // Historic Joke of the Day
  const jokeHtml = post.joke
    ? `
      <div class="joke-of-day">
        <p class="joke-label">🎭 Historic Joke of the Day</p>
        <p class="joke-setup">"${escapeHtml(post.joke.setup || post.joke.joke)}"</p>
        ${post.joke.punchline && post.joke.punchline !== post.joke.joke ? `<p class="joke-punchline">${escapeHtml(post.joke.punchline)}</p>` : ''}
        <p class="joke-credit">— ${escapeHtml(post.joke.comedian)} · ${escapeHtml(post.joke.year)}</p>
        <p class="joke-context">${escapeHtml(post.joke.context)}</p>
      </div>
    ` : '';

  // Citations
  const citationsHtml = (post.citations && post.citations.length > 0) || post.aiSource
    ? `
      <div class="citations-box">
        <strong>Sources & Citations:</strong>
        <ul>
          ${post.citations ? post.citations.map(link => `
            <li>
              <a href="${link}" target="_blank" rel="noopener noreferrer">${escapeHtml(link)}</a>
            </li>
          `).join('') : ''}
          ${post.aiSource ? `
            <li>
              <strong>AI source:</strong> ${escapeHtml(post.aiSource)}
            </li>
          ` : ''}
        </ul>
      </div>
    ` : '';

  const postUrl = `https://thingsource.netlify.app/blog/?id=${post.id}`;
  const encodedUrl = encodeURIComponent(postUrl);
  const encodedTitle = encodeURIComponent(`${post.title} — ThingSource`);

  const shareHtml = `
    <div class="share-section">
      <p>Enjoyed this story? Share it:</p>
      <div class="share-buttons-container">
        <a href="https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}&via=thingsource" class="share-btn" target="_blank">𝕏 Share on X</a>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" class="share-btn" target="_blank">LinkedIn Share on LinkedIn</a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" class="share-btn" target="_blank">f Share on Facebook</a>
        <a href="https://wa.me/?text=${encodedTitle}%20${encodedUrl}" class="share-btn" target="_blank">WhatsApp Share on WhatsApp</a>
        <button class="share-btn" onclick="copyPostLink(this, '${postUrl}')">🔗 Copy link</button>
      </div>
    </div>
  `;

  // Update meta tags dynamically
  document.title = `${post.title} — ThingSource`;
  
  const descEl = document.querySelector('meta[name="description"]');
  if (descEl) descEl.setAttribute("content", post.summary);

  const canonEl = document.querySelector('link[rel="canonical"]');
  if (canonEl) canonEl.setAttribute("href", postUrl);

  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", `${post.title} — ThingSource`);

  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute("content", post.summary);

  const ogImg = document.querySelector('meta[property="og:image"]');
  if (ogImg) ogImg.setAttribute("content", coverImage);

  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute("content", postUrl);

  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute("content", `${post.title} — ThingSource`);

  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute("content", post.summary);

  const twImg = document.querySelector('meta[name="twitter:image"]');
  if (twImg) twImg.setAttribute("content", coverImage);

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
      <div class="post-detail-hero-image">
        ${getPostImage(post)}
      </div>
      <div class="post-detail-body">
        ${renderedSections}
      </div>
      ${factsHtml}
      ${jokeHtml}
      <div style="
        background: linear-gradient(135deg, #0D7A6B 0%, #095e54 100%);
        border-radius: 16px;
        padding: 32px;
        margin: 48px 0;
        color: white;
        position: relative;
        overflow: hidden;">
        <div style="position:absolute;right:24px;top:50%;transform:translateY(-50%);font-size:120px;opacity:0.08;line-height:1;pointer-events:none;">♪</div>
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:rgba(255,255,255,0.6);margin:0 0 8px;font-family:Inter,sans-serif;">Keeping ThingSource free</p>
        <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;color:white;margin:0 0 12px;line-height:1.3;">Enjoyed this story?</h3>
        <p style="font-size:15px;color:rgba(255,255,255,0.85);line-height:1.7;margin:0 0 20px;font-family:Inter,sans-serif;max-width:480px;">
          ThingSource is created by <strong>Arman Ayva</strong> — a digital creator and technology enthusiast who also makes original music. Every Spotify stream supports this site and keeps it completely free for all readers.
        </p>
        <a href="https://open.spotify.com/search/Arman%20Ayva" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:10px;background:#1DB954;color:white;text-decoration:none;padding:12px 24px;border-radius:50px;font-family:Inter,sans-serif;font-size:15px;font-weight:600;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          Listen on Spotify — Search "Arman Ayva"
        </a>
        <p style="font-size:12px;color:rgba(255,255,255,0.5);margin:12px 0 0;font-family:Inter,sans-serif;">Free to stream · Supports independent creation · Thank you 🙏</p>
      </div>
      ${shareHtml}
      ${citationsHtml}
    </div>
  `;

  readerModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Global copy link function
window.copyPostLink = function(btn, url) {
  navigator.clipboard.writeText(url).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Copied!';
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  }).catch(err => {
    console.error("Failed to copy link:", err);
  });
};

// Close Modal
function closeModal() {
  readerModal.classList.remove('open');
  document.body.style.overflow = '';
  
  // Reset meta tags to default homepage values
  document.title = "ThingSource — Curious Origins & Accidental Genius";
  
  const descEl = document.querySelector('meta[name="description"]');
  if (descEl) descEl.setAttribute("content", "Discover the surprising origins of everyday things. From food to words to customs — delivered to your inbox daily.");

  const canonEl = document.querySelector('link[rel="canonical"]');
  if (canonEl) canonEl.setAttribute("href", "https://thingsource.netlify.app");

  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", "ThingSource — One Curious Origin Story, Every Morning");

  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute("content", "Discover the surprising origins of everyday things. From food to words to customs — delivered to your inbox daily.");

  const ogImg = document.querySelector('meta[property="og:image"]');
  if (ogImg) ogImg.setAttribute("content", "https://thingsource.netlify.app/social-card.png");

  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute("content", "https://thingsource.netlify.app");

  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute("content", "ThingSource — One Curious Origin Story, Every Morning");

  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute("content", "Discover the surprising origins of everyday things. From food to words to customs — delivered to your inbox daily.");

  const twImg = document.querySelector('meta[name="twitter:image"]');
  if (twImg) twImg.setAttribute("content", "https://thingsource.netlify.app/social-card.png");
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
