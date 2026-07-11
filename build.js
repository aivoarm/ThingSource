const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const postsPath = path.join(publicDir, 'posts.json');
const blogDir = path.join(publicDir, 'blog');

// Ensure public/blog/ exists
if (!fs.existsSync(blogDir)) {
  fs.mkdirSync(blogDir, { recursive: true });
}

// Load posts
let posts = [];
if (fs.existsSync(postsPath)) {
  try {
    posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
  } catch (e) {
    console.error("Error reading posts.json during build:", e);
  }
}

// Filter out draft posts
const publishedPosts = posts.filter(p => !p.draft);
console.log(`[Build] Found ${publishedPosts.length} published posts.`);

// ── GENERATE RSS ───────────────────────────────────────────────────────────
const rssPath = path.join(blogDir, 'rss.xml');
const rssItems = publishedPosts.map(post => {
  const postSlug = post.slug || post.id;
  return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>https://ts.armanayva.com/blog/${postSlug}/</link>
      <guid isPermaLink="false">${post.id}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <description>${escapeXml(post.summary)}</description>
      <category>${escapeXml(post.category)}</category>
    </item>`;
}).join('\n');

const rssContent = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ThingSource — Curious Origins &amp; Accidental Genius</title>
    <link>https://ts.armanayva.com/blog/</link>
    <description>An automated daily blog researching the surprising origin of everyday things.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://ts.armanayva.com/blog/rss.xml" rel="self" type="application/rss+xml" />
${rssItems}
  </channel>
</rss>`;

fs.writeFileSync(rssPath, rssContent, 'utf8');
console.log(`[Build] Generated ${rssPath}`);

// ── GENERATE SITEMAP ───────────────────────────────────────────────────────
const sitemapPath = path.join(publicDir, 'sitemap.xml');
const sitemapUrls = publishedPosts.map(post => {
  const postSlug = post.slug || post.id;
  return `  <url>
    <loc>https://ts.armanayva.com/blog/${postSlug}/</loc>
    <lastmod>${post.date.substring(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
  </url>`;
}).join('\n');

const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://ts.armanayva.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://ts.armanayva.com/blog/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://ts.armanayva.com/about.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://ts.armanayva.com/contact.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://ts.armanayva.com/privacy-policy.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://ts.armanayva.com/terms-of-service.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
${sitemapUrls}
</urlset>`;

fs.writeFileSync(sitemapPath, sitemapContent, 'utf8');
console.log(`[Build] Generated ${sitemapPath}`);

// ── GENERATE STATIC BLOG PAGES ─────────────────────────────────────────────
console.log(`[Build] Pre-rendering static HTML pages for ${publishedPosts.length} posts...`);
const blogHtmlTemplatePath = path.join(publicDir, 'blog', 'index.html');

if (fs.existsSync(blogHtmlTemplatePath)) {
  const template = fs.readFileSync(blogHtmlTemplatePath, 'utf8');
  
  publishedPosts.forEach(post => {
    const postSlug = post.slug || post.id;
    const postDir = path.join(blogDir, postSlug);
    
    if (!fs.existsSync(postDir)) {
      fs.mkdirSync(postDir, { recursive: true });
    }
    
    // JSON-LD Schemas for Search Engines
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": `What is the origin of ${post.topic}?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `${post.summary} ${post.sections && post.sections[0] ? post.sections[0].content : ''}`
          }
        },
        {
          "@type": "Question", 
          "name": `Where did ${post.topic} come from?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `${post.sections && post.sections[1] ? post.sections[1].content : (post.sections && post.sections[0] ? post.sections[0].content : '')}`
          }
        }
      ]
    };

    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": post.title,
      "description": post.summary,
      "datePublished": post.date,
      "dateModified": post.date,
      "author": {
        "@type": "Person",
        "name": "Arman Ayva",
        "url": "https://armanayva.com"
      },
      "publisher": {
        "@type": "Organization",
        "name": "ThingSource",
        "url": "https://ts.armanayva.com",
        "logo": {
          "@type": "ImageObject",
          "url": "https://ts.armanayva.com/social-card.png"
        }
      },
      "image": (post.images && post.images[0]) || "https://ts.armanayva.com/social-card.png",
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `https://ts.armanayva.com/blog/${postSlug}/`
      }
    };

    const postContentHtml = getPostHtml(post);
    let html = template;
    
    // Regex replacements based on specific meta tag IDs
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${post.title} | Origin Story | ThingSource</title>`);
    html = html.replace(/<meta id="meta-description"[\s\S]*?>/, `<meta id="meta-description" name="description" content="Discover the surprising origin of ${post.topic}. ${post.summary}">`);
    html = html.replace(/<meta id="meta-keywords"[\s\S]*?>/, `<meta id="meta-keywords" name="keywords" content="origin of ${post.topic}, history of ${post.topic}, where did ${post.topic} come from, ${post.topic} history, ${post.category} origins">`);
    html = html.replace(/<link id="canonical-link"[\s\S]*?>/, `<link id="canonical-link" rel="canonical" href="https://ts.armanayva.com/blog/${postSlug}/">`);
    
    html = html.replace(/<meta id="og-title"[\s\S]*?>/, `<meta id="og-title" property="og:title" content="${post.title} | ThingSource">`);
    html = html.replace(/<meta id="og-description"[\s\S]*?>/, `<meta id="og-description" property="og:description" content="${post.summary}">`);
    html = html.replace(/<meta id="og-image"[\s\S]*?>/, `<meta id="og-image" property="og:image" content="${post.images?.[0] || 'https://ts.armanayva.com/social-card.png'}">`);
    html = html.replace(/<meta id="og-url"[\s\S]*?>/, `<meta id="og-url" property="og:url" content="https://ts.armanayva.com/blog/${postSlug}/">`);
    
    html = html.replace(/<meta id="twitter-title"[\s\S]*?>/, `<meta id="twitter-title" name="twitter:title" content="${post.title} | ThingSource">`);
    html = html.replace(/<meta id="twitter-description"[\s\S]*?>/, `<meta id="twitter-description" name="twitter:description" content="${post.summary}">`);
    html = html.replace(/<meta id="twitter-image"[\s\S]*?>/, `<meta id="twitter-image" name="twitter:image" content="${post.images?.[0] || 'https://ts.armanayva.com/social-card.png'}">`);
    
    // Inject schemas before </head>
    const schemaHtml = `
  <!-- JSON-LD Structured Data for Search Engines -->
  <script type="application/ld+json">
${JSON.stringify(articleSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(faqSchema, null, 2)}
  </script>
</head>`;
    html = html.replace("</head>", schemaHtml);
    
    // Switch views to show detail, and insert content
    html = html.replace('<div id="blog-list-view">', '<div id="blog-list-view" style="display: none;">');
    html = html.replace('<div id="blog-detail-view" style="display: none;">', '<div id="blog-detail-view" style="display: block;">');
    html = html.replace('<!-- Will be populated dynamically -->', postContentHtml);
    
    fs.writeFileSync(path.join(postDir, 'index.html'), html, 'utf8');
  });
  console.log(`[Build] Statically generated HTML for ${publishedPosts.length} posts.`);
} else {
  console.error(`[Build] Could not find template at ${blogHtmlTemplatePath}`);
}

function escapeXml(unsafe) {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

function renderMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function getPostImageHtml(post) {
  if (post.images && post.images[0]) {
    return `<div class="image-container">
      <img src="${post.images[0]}" alt="${post.title}" loading="lazy" style="width:100%;height:100%;object-fit:cover">
    </div>`;
  }
  return `<div class="image-container" style="background-color: var(--card-bg, #f7f5f0); height: 260px; display: flex; align-items: center; justify-content: center; font-size: 3rem;">🔍</div>`;
}

function getPostHtml(post) {
  const dateStr = new Date(post.date).toLocaleDateString(undefined, {month: 'long', day: 'numeric', year: 'numeric'});
  
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

  let renderedSections = "";
  if (post.sections && post.sections.length > 0) {
    renderedSections += `
      <h3 style="font-family: var(--font-serif); font-size: 1.6rem; color: var(--text-dark); margin-top: 2rem; margin-bottom: 1rem;">${escapeXml(post.sections[0].heading)}</h3>
      <p style="margin-bottom: 1.5rem;">${renderMarkdown(post.sections[0].content)}</p>
    `;
    if (post.sections.length > 1) {
      renderedSections += inlineAdHtml;
      for (let i = 1; i < post.sections.length; i++) {
        renderedSections += `
          <h3 style="font-family: var(--font-serif); font-size: 1.6rem; color: var(--text-dark); margin-top: 2rem; margin-bottom: 1rem;">${escapeXml(post.sections[i].heading)}</h3>
          <p style="margin-bottom: 1.5rem;">${renderMarkdown(post.sections[i].content)}</p>
        `;
      }
    } else {
      renderedSections += inlineAdHtml;
    }
  } else {
    renderedSections = inlineAdHtml;
  }

  const factsHtml = post.funFacts && post.funFacts.length > 0 
    ? `
      <div class="fun-facts-box">
        <h4>Did you know?</h4>
        <ul>
          ${post.funFacts.map(fact => `<li>${escapeXml(fact)}</li>`).join('')}
        </ul>
      </div>
    ` : '';

  const jokeHtml = post.joke
    ? `
      <div class="joke-of-day">
        <p class="joke-label">🎭 Joke of the Day</p>
        <p class="joke-setup">"${escapeXml(post.joke.setup || post.joke.joke)}"</p>
        ${post.joke.punchline && post.joke.punchline !== post.joke.joke ? `<p class="joke-punchline">${escapeXml(post.joke.punchline)}</p>` : ''}
        <p class="joke-credit">— ${escapeXml(post.joke.comedian)} · ${escapeXml(post.joke.year)}</p>
        <p class="joke-context">${escapeXml(post.joke.context)}</p>
      </div>
    ` : '';

  const citationsHtml = (post.citations && post.citations.length > 0) || post.aiSource
    ? `
      <div class="citations-box">
        <strong>Sources & Citations:</strong>
        <ul>
          ${post.citations ? post.citations.map(link => `
            <li><a href="${link}" target="_blank" rel="noopener noreferrer">${escapeXml(link)}</a></li>
          `).join('') : ''}
          ${post.aiSource ? `
            <li>
              <strong>AI source:</strong> ${escapeXml(post.aiSource)}
            </li>
          ` : ''}
        </ul>
      </div>
    ` : '';

  const encodedUrl = encodeURIComponent(`https://ts.armanayva.com/blog/${post.slug || post.id}`);
  const encodedTitle = encodeURIComponent(`${post.title} — ThingSource`);

  const shareHtml = `
    <div class="share-section">
      <p>Enjoyed this story? Share it:</p>
      <div class="share-buttons-container">
        <a href="https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}&via=thingsource" class="share-btn" target="_blank">𝕏 Share on X</a>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" class="share-btn" target="_blank">LinkedIn Share on LinkedIn</a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" class="share-btn" target="_blank">f Share on Facebook</a>
        <a href="https://wa.me/?text=${encodedTitle}%20${encodedUrl}" class="share-btn" target="_blank">WhatsApp Share on WhatsApp</a>
        <button class="share-btn" onclick="copyPostLink(this, 'https://ts.armanayva.com/blog/${post.slug || post.id}')">🔗 Copy link</button>
      </div>
    </div>
  `;

  return `
    <div class="post-detail-container">
      <div style="margin-bottom: 1.5rem;">
        <span class="badge">${post.category || 'Discovery'}</span>
      </div>
      <h1 class="post-detail-title" style="font-size: 2.6rem;">${escapeXml(post.title)}</h1>
      <div class="post-detail-meta">
        <span>📅 ${dateStr}</span>
        <span>🔍 Topic: ${escapeXml(post.topic)}</span>
      </div>
      <div class="post-detail-hero-image" style="margin-bottom: 2rem;">
        ${getPostImageHtml(post)}
      </div>
      <div class="post-detail-body">
        ${renderedSections}
      </div>
      ${factsHtml}
      ${jokeHtml}
      <div style="background:linear-gradient(135deg,#0D7A6B 0%,#095e54 100%);border-radius:16px;padding:32px;margin:48px 0;color:white;position:relative;overflow:hidden;">
        <div style="position:absolute;right:24px;top:50%;transform:translateY(-50%);font-size:120px;opacity:0.08;line-height:1;pointer-events:none;">♪</div>
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:rgba(255,255,255,0.6);margin:0 0 8px;font-family:Inter,sans-serif;">Keeping ThingSource free</p>
        <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;color:white;margin:0 0 12px;line-height:1.3;">Enjoyed this story?</h3>
        <p style="font-size:15px;color:rgba(255,255,255,0.85);line-height:1.7;margin:0 0 20px;font-family:Inter,sans-serif;max-width:480px;">
          ThingSource is created by <strong>Arman Ayva</strong> — a digital creator and technology enthusiast who also makes original music. Every Spotify stream supports this site and keeps it completely free for all readers.
        </p>
        <a href="https://open.spotify.com/search/Arman%20Ayva" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:10px;background:#1DB954;color:white;text-decoration:none;padding:12px 24px;border-radius:50px;font-family:Inter,sans-serif;font-size:15px;font-weight:600;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9-4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          Listen on Spotify — Search "Arman Ayva"
        </a>
        <p style="font-size:12px;color:rgba(255,255,255,0.5);margin:12px 0 0;font-family:Inter,sans-serif;">Free to stream · Supports independent creation · Thank you 🙏</p>
      </div>
      ${shareHtml}
      ${citationsHtml}
    </div>
  `;
}
