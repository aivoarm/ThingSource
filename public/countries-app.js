// Client App State
let appState = {
  posts: []
};

// DOM Elements
const countrySelect = document.getElementById('country-select');
const feedContainer = document.getElementById('country-digest-feed');
const subForm = document.getElementById('countries-subscribe-form');
const emailInput = document.getElementById('countries-sub-email');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCountryPosts();
  
  if (countrySelect) {
    countrySelect.addEventListener('change', renderCountryFeed);
  }
  
  if (subForm) {
    subForm.addEventListener('submit', handleSubscribe);
  }
});

// Load country posts from static database country-posts.json
async function loadCountryPosts() {
  try {
    const res = await fetch('/country-posts.json');
    if (!res.ok) throw new Error("Failed to load country digests.");
    appState.posts = await res.json();
    renderCountryFeed();
  } catch (err) {
    console.error("Error loading country posts:", err);
    if (feedContainer) {
      feedContainer.innerHTML = `<p style="text-align:center;color:var(--accent-red);padding:2rem;">Error loading country digests: ${err.message}</p>`;
    }
  }
}

// Render country digests filterable by country value
function renderCountryFeed() {
  if (!feedContainer || !countrySelect) return;
  
  const selectedCountry = countrySelect.value;
  const filtered = appState.posts.filter(p => p.country.toLowerCase() === selectedCountry.toLowerCase());
  
  if (filtered.length === 0) {
    feedContainer.innerHTML = `
      <div style="text-align:center;padding:4rem 2rem;background:#fff;border-radius:16px;border:1px dashed var(--border-color);">
        <p style="font-size:1.1rem;color:var(--text-muted);">No digests published for ${selectedCountry} yet.</p>
        <p style="font-size:0.9rem;color:var(--text-muted);margin-top:0.5rem;">The research agent compiles facts daily. Stay tuned!</p>
      </div>
    `;
    return;
  }
  
  feedContainer.innerHTML = filtered.map(post => {
    const formattedDate = new Date(post.date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    return `
      <div class="digest-card">
        <div class="digest-meta">
          <span>📍 ${escapeHtml(post.country)} Daily Digest</span>
          <span>📅 ${formattedDate}</span>
        </div>
        
        <!-- Fact section -->
        <h4 class="section-title">💡 Fact of the Day: ${escapeHtml(post.fact.title)}</h4>
        <p class="section-content">${escapeHtml(post.fact.content)}</p>
        
        <!-- Culture section -->
        <h4 class="section-title">🎭 Cultural Insight: ${escapeHtml(post.culture.title)}</h4>
        <p class="section-content">${escapeHtml(post.culture.content)}</p>
        
        <!-- News section -->
        <h4 class="section-title">📰 News & Events: ${escapeHtml(post.news.title)}</h4>
        <p class="section-content">${escapeHtml(post.news.content)}</p>
        
        ${post.news.url ? `
          <div style="margin-top: 1.25rem;">
            <a href="${post.news.url}" target="_blank" rel="noopener noreferrer" class="news-source-link">
              Read news source article &rarr;
            </a>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Handle Subscription
async function handleSubscribe(e) {
  e.preventDefault();
  const email = emailInput.value.trim();
  if (!email) return;
  
  const submitBtn = subForm.querySelector('.sub-btn');
  submitBtn.disabled = true;
  const originalText = submitBtn.innerText;
  submitBtn.innerText = 'Subscribing...';
  
  const thingsourcePref = document.getElementById('sub-thingsource')?.checked !== false;
  const sciencePref = document.getElementById('sub-science')?.checked === true;
  const countriesCheck = document.getElementById('sub-countries')?.checked === true;
  
  const countries = [];
  if (countriesCheck) {
    document.querySelectorAll('.sub-country-item:checked').forEach(cb => {
      countries.push(cb.value);
    });
  }
  
  const preferences = {
    thingsource: thingsourcePref,
    science: sciencePref,
    countries: countries
  };
  
  try {
    const res = await fetch('/.netlify/functions/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, preferences })
    });
    
    const data = await res.json();
    if (res.ok) {
      document.getElementById('subscribe-card-container').innerHTML = `
        <div style="padding: 2rem 0;">
          <p class="success-msg">Subscription request received!</p>
          <p style="font-size:0.95rem;opacity:0.8;margin-top:0.5rem;">Please check your inbox for a verification email to confirm your subscription.</p>
        </div>
      `;
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

// Escape HTML utility
function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
