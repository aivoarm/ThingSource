let state = {
  posts: []
};

document.addEventListener('DOMContentLoaded', () => {
  loadPosts();
  initSubscribeForm();
});

async function loadPosts() {
  const grid = document.getElementById('posts-grid');
  try {
    const res = await fetch('/science-posts.json');
    if (!res.ok) throw new Error("Could not load science discoveries.");
    state.posts = await res.json();
    renderPosts();
  } catch (err) {
    console.error(err);
    if (grid) {
      grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--accent-pink);">Error loading articles: ${err.message}</p>`;
    }
  }
}

function renderPosts() {
  const grid = document.getElementById('posts-grid');
  if (!grid) return;

  if (state.posts.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No science stories compiled yet. The science explorer is still researching. Check back soon!</p>`;
    return;
  }

  grid.innerHTML = state.posts.map(post => {
    const formattedDate = new Date(post.date).toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    return `
      <div class="post-card" onclick="openPost('${post.id}')">
        <div class="card-meta">✨ Daily Science</div>
        <h3 class="card-title">${escapeHtml(post.title)}</h3>
        <p class="card-summary">${escapeHtml(post.summary)}</p>
        <div class="card-footer">
          <span>📅 ${formattedDate}</span>
          <span class="read-btn">Read Story →</span>
        </div>
      </div>
    `;
  }).join("");
}

function openPost(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;

  const modal = document.getElementById('reader-modal');
  const title = document.getElementById('modal-title');
  const meta = document.getElementById('modal-meta');
  const body = document.getElementById('modal-body');

  if (!modal || !title || !meta || !body) return;

  const formattedDate = new Date(post.date).toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  title.innerText = post.title;
  meta.innerText = `📅 Published on ${formattedDate} · Simplified Science`;

  let sectionsHtml = (post.sections || []).map(sec => `
    <h3>${escapeHtml(sec.heading)}</h3>
    <p>${escapeHtml(sec.content)}</p>
  `).join("");

  let factsHtml = post.funFacts && post.funFacts.length > 0 ? `
    <div class="fun-facts-box">
      <h4>💡 Mind-Blowing Facts!</h4>
      <ul>
        ${post.funFacts.map(fact => `<li>${escapeHtml(fact)}</li>`).join("")}
      </ul>
    </div>
  ` : '';

  let originalHtml = `
    <div class="original-link-box">
      <strong>Based on the original scientific study:</strong><br>
      <a href="${post.originalUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.originalTitle)} ↗</a>
    </div>
  `;

  body.innerHTML = sectionsHtml + factsHtml + originalHtml;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

window.closeModal = function() {
  const modal = document.getElementById('reader-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function initSubscribeForm() {
  const form = document.getElementById('subscribe-form');
  const container = document.getElementById('subscribe-container');
  if (!form || !container) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('subscribe-email');
    const email = emailInput.value.trim();
    if (!email) return;

    const btn = form.querySelector('.subscribe-btn');
    btn.disabled = true;
    const oldText = btn.innerText;
    btn.innerText = 'Joining...';

    try {
      const res = await fetch('/.netlify/functions/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        container.innerHTML = `<p class="subscribe-success">🚀 Success! Check your inbox for a welcome email.</p>`;
      } else {
        alert(data.message || data.error || "Subscription failed.");
        btn.disabled = false;
        btn.innerText = oldText;
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please try again.");
      btn.disabled = false;
      btn.innerText = oldText;
    }
  });
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
