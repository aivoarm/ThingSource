const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

require('dotenv').config();

const postsPath = path.join(__dirname, 'public/science-posts.json');

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
  console.log(`Fetching RSS feed from: ${url}`);
  
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
  console.log(`Simplifying article: "${article.title}"`);
  
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

async function runLocalScienceAgent() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY is not set.");
    return;
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const rawArticles = await fetchTopScienceArticles();
    if (rawArticles.length === 0) {
      console.log("No articles found in RSS feed.");
      return;
    }
    
    console.log(`Found ${rawArticles.length} articles. Simplifying them...`);
    const simplifiedArticles = [];
    
    for (const article of rawArticles) {
      try {
        const simplified = await simplifyArticle(ai, article);
        simplified.id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        simplified.date = new Date().toISOString();
        simplifiedArticles.push(simplified);
      } catch (err) {
        console.error(`Error simplifying article "${article.title}":`, err.message);
      }
    }
    
    if (simplifiedArticles.length === 0) {
      console.log("Failed to simplify any articles.");
      return;
    }
    
    console.log(`Successfully simplified ${simplifiedArticles.length} articles. Saving to ${postsPath}...`);
    
    let existingPosts = [];
    if (fs.existsSync(postsPath)) {
      try {
        existingPosts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
      } catch (e) {
        console.warn("Could not read science-posts.json, starting fresh.");
      }
    }
    
    // Prepend the new digest (as a single daily grouping or as individual articles)
    // The requirement says: "converts top 3 into simple language... create article and send daily digest"
    // We can save them as individual articles but grouped by date or just added individually to the feed.
    // Let's add them as individual articles in the feed! That way the reader can see a feed of simplified science news.
    // Let's pre-pend them to existing posts.
    existingPosts = [...simplifiedArticles, ...existingPosts];
    
    fs.writeFileSync(postsPath, JSON.stringify(existingPosts, null, 2), 'utf8');
    console.log("Local agent execution completed successfully.");
    
  } catch (error) {
    console.error("Fatal error running local science agent:", error.message);
  }
}

if (require.main === module) {
  runLocalScienceAgent();
}

module.exports = { runLocalScienceAgent };
