const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const postsPath = path.join(publicDir, 'posts.json');
const sitemapPath = path.join(publicDir, 'sitemap.xml');

// Load posts
let posts = [];
if (fs.existsSync(postsPath)) {
  try {
    posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
  } catch (e) {
    console.error("Error reading posts.json during sitemap generation:", e);
  }
}

// Filter out draft posts
const publishedPosts = posts.filter(p => !p.draft);
console.log(`[Sitemap] Generating sitemap for ${publishedPosts.length} posts.`);

const today = new Date().toISOString().substring(0, 10);

const sitemapUrls = publishedPosts.map(post => {
  const lastmod = post.date ? post.date.substring(0, 10) : today;
  const identifier = post.slug || post.id;
  return `  <url>
    <loc>https://ts.armanayva.com/blog/${identifier}</loc>
    <changefreq>never</changefreq>
    <priority>0.8</priority>
    <lastmod>${lastmod}</lastmod>
  </url>`;
}).join('\n');

const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  
  <url>
    <loc>https://ts.armanayva.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <lastmod>${today}</lastmod>
  </url>
  
  <url>
    <loc>https://ts.armanayva.com/blog/</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
    <lastmod>${today}</lastmod>
  </url>
  
  <url>
    <loc>https://ts.armanayva.com/science.html</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
    <lastmod>${today}</lastmod>
  </url>
  
${sitemapUrls}

</urlset>`.trim();

fs.writeFileSync(sitemapPath, sitemapContent, 'utf8');
console.log(`[Sitemap] Successfully generated sitemap.xml at ${sitemapPath}`);
