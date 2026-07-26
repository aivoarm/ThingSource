const { GoogleGenAI } = require("@google/genai");

function cleanXmlText(str) {
  if (!str) return "";
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

async function fetchTopScienceArticles() {
  const feeds = [
    "https://www.sciencedaily.com/rss/top/science.xml",
    "https://www.nature.com/nature.rss",
    "https://www.nasa.gov/news-release/feed/",
    "https://www.science.org/rss/news_current.xml",
    "https://phys.org/rss-feed/",
    "https://www.newscientist.com/section/news/feed/"
  ];
  
  const shuffledFeeds = feeds.sort(() => 0.5 - Math.random());
  const allItems = [];
  
  for (const url of shuffledFeeds) {
    try {
      console.log(`[science-agent] Fetching RSS feed from: ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.warn(`[science-agent] Failed to fetch ${url}. Status: ${response.status}`);
        continue;
      }
      
      const xml = await response.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      let count = 0;
      
      while ((match = itemRegex.exec(xml)) !== null && count < 5) {
        const itemContent = match[1];
        const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
        const descMatch = itemContent.match(/<description>([\s\S]*?)<\/description>/) || 
                          itemContent.match(/<summary>([\s\S]*?)<\/summary>/);
        const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
        
        if (titleMatch && linkMatch) {
          const title = cleanXmlText(titleMatch[1]);
          const description = descMatch ? cleanXmlText(descMatch[1]) : "";
          const link = cleanXmlText(linkMatch[1]);
          
          if (title && link) {
            allItems.push({ 
              title, 
              description: description.replace(/<[^>]*>/g, "").trim(), 
              url: link 
            });
            count++;
          }
        }
      }
    } catch (err) {
      console.warn(`[science-agent] Error fetching or parsing feed ${url}:`, err.message);
    }
    
    if (allItems.length >= 10) break;
  }
  
  return allItems.sort(() => 0.5 - Math.random()).slice(0, 3);
}

async function simplifyArticle(ai, article) {
  console.log(`[science-agent] Simplifying article: "${article.title}"`);
  
  const prompt = `You are a clear, engaging science communicator writing for curious adults.
Take the following science news article (title and summary) and rewrite it so a general adult audience can easily understand the significance, key findings, and core concepts without needing a scientific background.
Use engaging, clear, and professional yet accessible language. Avoid heavy academic jargon, or explain it using elegant analogies. Do not sound childish or condescending.

Original Title: ${article.title}
Original Summary: ${article.description}
Original Link: ${article.url}

Do all of the following in one response. Return ONLY a raw JSON object with no markdown and no backticks:
{
  "title": "A compelling, clear, and engaging title",
  "summary": "1-2 sentence compelling hook highlighting the main discovery and its importance",
  "sections": [
    { "heading": "Clear Subheading 1", "content": "2-3 engaging, informative sentences." },
    { "heading": "Clear Subheading 2", "content": "2-3 engaging, informative sentences." }
  ],
  "funFacts": [
    "Interesting key takeaway or context 1",
    "Interesting key takeaway or context 2",
    "Interesting key takeaway or context 3"
  ],
  "originalTitle": "${article.title.replace(/"/g, '\\"')}",
  "originalUrl": "${article.url}"
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  let text = response.text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/```json|```/g, "").trim();
  }
  
  return JSON.parse(text);
}

async function runScienceAgent() {
  console.log("[science-agent] Starting science agent execution...");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Fetch existing posts from GitHub
  console.log("[science-agent] Fetching science-posts.json from GitHub...");
  const repoPath = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/public/science-posts.json`;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "User-Agent": "ThingSource-Science-Agent"
  };

  const getController = new AbortController();
  const getTimeout = setTimeout(() => getController.abort(), 15000);
  const currentRes = await fetch(repoPath, { 
    headers,
    signal: getController.signal
  });
  clearTimeout(getTimeout);

  if (!currentRes.ok) {
    throw new Error(`Failed to fetch science-posts.json from GitHub. Status: ${currentRes.status}`);
  }
  
  const current = await currentRes.json();
  const existingPosts = current.content
    ? JSON.parse(Buffer.from(current.content, "base64").toString("utf8"))
    : [];
  const currentSha = current.sha;

  const rawArticles = await fetchTopScienceArticles();
  if (rawArticles.length === 0) {
    console.log("[science-agent] No new articles to process.");
    return;
  }

  console.log(`[science-agent] Found ${rawArticles.length} articles to process.`);
  const simplifiedArticles = [];
  
  for (const article of rawArticles) {
    try {
      // Check to see if we already processed this article in our recent logs to avoid duplicates
      const isDuplicate = existingPosts.some(p => p.originalTitle === article.title || p.originalUrl === article.url);
      if (isDuplicate) {
        console.log(`[science-agent] Skipping duplicate article: ${article.title}`);
        continue;
      }
      
      const simplified = await simplifyArticle(ai, article);
      simplified.id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      simplified.date = new Date().toISOString();
      simplifiedArticles.push(simplified);
    } catch (err) {
      console.error(`[science-agent] Error processing article "${article.title}":`, err.message);
    }
  }

  if (simplifiedArticles.length === 0) {
    console.log("[science-agent] No new simplified articles to add.");
    return;
  }

  const updatedPosts = [...simplifiedArticles, ...existingPosts];
  const newContent = Buffer.from(JSON.stringify(updatedPosts, null, 2)).toString("base64");

  console.log("[science-agent] Committing updated science-posts.json to GitHub...");
  const putController = new AbortController();
  const putTimeout = setTimeout(() => putController.abort(), 15000);
  const putRes = await fetch(repoPath, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `feat: add ${simplifiedArticles.length} simplified science articles`,
      content: newContent,
      sha: currentSha,
      branch: process.env.GITHUB_BRANCH || "main",
    }),
    signal: putController.signal
  });
  clearTimeout(putTimeout);

  if (!putRes.ok) {
    throw new Error(`Failed to commit science-posts.json to GitHub. Status: ${putRes.status}`);
  }
  console.log("[science-agent] Successfully committed science-posts.json to GitHub.");

  console.log("[science-agent] Run completed. Science articles updated.");
}

module.exports = { runScienceAgent };
