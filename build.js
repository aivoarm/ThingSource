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
const rssItems = publishedPosts.map(post => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>https://thingsource.netlify.app/blog/?id=${post.id}</link>
      <guid isPermaLink="false">${post.id}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <description>${escapeXml(post.summary)}</description>
      <category>${escapeXml(post.category)}</category>
    </item>`).join('\n');

const rssContent = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ThingSource — Curious Origins &amp; Accidental Genius</title>
    <link>https://thingsource.netlify.netlify.app/blog/</link>
    <description>An automated daily blog researching the surprising origin of everyday things.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://thingsource.netlify.app/blog/rss.xml" rel="self" type="application/rss+xml" />
${rssItems}
  </channel>
</rss>`;

fs.writeFileSync(rssPath, rssContent, 'utf8');
console.log(`[Build] Generated ${rssPath}`);

// ── GENERATE SITEMAP ───────────────────────────────────────────────────────
const sitemapPath = path.join(publicDir, 'sitemap.xml');
const sitemapUrls = publishedPosts.map(post => `  <url>
    <loc>https://thingsource.netlify.app/blog/?id=${post.id}</loc>
    <lastmod>${post.date.substring(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
  </url>`).join('\n');

const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://thingsource.netlify.app/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://thingsource.netlify.app/blog/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://thingsource.netlify.app/about.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://thingsource.netlify.app/contact.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://thingsource.netlify.app/privacy-policy.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://thingsource.netlify.app/terms-of-service.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
${sitemapUrls}
</urlset>`;

fs.writeFileSync(sitemapPath, sitemapContent, 'utf8');
console.log(`[Build] Generated ${sitemapPath}`);

function escapeXml(unsafe) {
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
