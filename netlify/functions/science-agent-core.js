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
  const url = "https://www.sciencedaily.com/rss/top/science.xml";
  console.log(`[science-agent] Fetching RSS feed from: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed. Status: ${response.status}`);
  }
  
  const xml = await response.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null && items.length < 3) {
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
        items.push({ title, description: description.replace(/<[^>]*>/g, "").trim(), url: link });
      }
    }
  }
  return items;
}

async function simplifyArticle(ai, article) {
  console.log(`[science-agent] Simplifying article: "${article.title}"`);
  
  const prompt = `You are a warm, engaging science educator writing for 10-year-old kids.
Take the following science news article (title and summary) and rewrite it so a 10-year-old child can easily understand it and get excited about it.
Use fun, conversational language. Avoid advanced jargon or explain it using simple, everyday analogies. 

Original Title: ${article.title}
Original Summary: ${article.description}
Original Link: ${article.url}

Do all of the following in one response. Return ONLY a raw JSON object with no markdown and no backticks:
{
  "title": "A super catchy, child-friendly title",
  "summary": "1-2 sentence compelling hook that makes a kid say 'Wow!'",
  "sections": [
    { "heading": "Catchy Subheading 1", "content": "2-3 simple, engaging sentences." },
    { "heading": "Catchy Subheading 2", "content": "2-3 simple, engaging sentences." }
  ],
  "funFacts": [
    "A cool mind-blowing fact 1",
    "A cool mind-blowing fact 2",
    "A cool mind-blowing fact 3"
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
