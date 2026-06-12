const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

// Load environment variables if running standalone
require('dotenv').config();

const dataDir = path.join(__dirname, 'data');
const publicDir = path.join(__dirname, 'public');
const imagesDir = path.join(publicDir, 'images');
const logFile = path.join(dataDir, 'agent_run.log');

// Ensure directories exist
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });

function initLog() {
  fs.writeFileSync(logFile, `[${new Date().toISOString()}] Agent session initialized.\n`);
}

function log(message) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(logFile, formatted);
  } catch (e) {
    console.error('Failed to write to log file:', e);
  }
}

// Helper: Custom fetch image downloader (resilient to fetch absence, though fetch is standard in Node 18+)
async function downloadImage(url, destPath) {
  log(`Downloading image from ${url.substring(0, 60)}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(destPath, buffer);
    log(`Successfully saved image to ${path.basename(destPath)}`);
    return true;
  } catch (err) {
    log(`Error downloading image: ${err.message}`);
    return false;
  }
}

// Helper: Fetch search page from Unsplash and parse photo URLs
async function getUnsplashImage(keyword) {
  log(`Searching Unsplash for: "${keyword}"`);
  try {
    const url = `https://unsplash.com/s/photos/${encodeURIComponent(keyword)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch search page: ${response.statusText}`);
    }
    
    const html = await response.text();
    // Match Unsplash photo URLs
    const matches = [...html.matchAll(/https:\/\/images\.unsplash\.com\/photo-[a-zA-Z0-9\-_]+(?:\?[a-zA-Z0-9=&%;]+)?/g)];
    const urls = matches.map(m => m[0]);
    
    // Filter out profile images, avatars, or low-res thumbs
    const filteredUrls = urls.filter(u => u.includes('w=') || u.includes('crop=') || u.includes('fit='));
    
    if (filteredUrls.length > 0) {
      // Pick one of the first few matches
      const index = Math.min(2, Math.floor(Math.random() * Math.min(filteredUrls.length, 5)));
      let imageUrl = filteredUrls[index];
      
      // Clean up and adjust dimensions for the blog (make it 800x500 for a consistent landscape layout)
      imageUrl = imageUrl.replace(/w=\d+/, 'w=800').replace(/h=\d+/, 'h=500');
      if (!imageUrl.includes('h=')) {
        imageUrl += '&h=500&fit=crop';
      }
      log(`Found Unsplash image: ${imageUrl.substring(0, 60)}...`);
      return imageUrl;
    }
  } catch (e) {
    log(`Unsplash crawl failed for "${keyword}": ${e.message}. Using fallback.`);
  }
  
  // Fallback to Unsplash Featured redirect which returns a high-quality stock photo
  const fallback = `https://images.unsplash.com/featured/?${encodeURIComponent(keyword)}`;
  log(`Using fallback placeholder URL: ${fallback}`);
  return fallback;
}

async function runAgent(customTopic = null) {
  initLog();
  log("Starting ThingSource Agent run...");
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("your_")) {
    log("ERROR: GEMINI_API_KEY is not set or is invalid in the environment variables / .env file.");
    log("Please set the GEMINI_API_KEY in the configuration panel or .env file.");
    return false;
  }
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    let topic = customTopic;
    let blogTitleSuggestion = "";
    
    // Step 1: Autonomous Topic Selection (if no custom topic provided)
    if (!topic) {
      log("No custom topic provided. Asking Gemini to select an interesting thing to research...");
      const topicPrompt = `Suggest one extremely interesting, specific, and slightly mysterious origin or source of an everyday thing (such as a food item, a common custom, an idiom, a widely used word, or a simple invention).
      The suggestion must be suitable for a highly engaging history and trivia blog post.
      Return ONLY a raw JSON object with two fields:
      - "topic": The exact search query term (e.g., "margherita pizza origin" or "why we clink glasses")
      - "title": A catchy headline for this research.
      Do not wrap it in markdown block tags. Return only the raw JSON.`;
      
      const topicResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: topicPrompt,
      });
      
      try {
        let text = topicResponse.text.trim();
        // Remove markdown backticks if any
        if (text.startsWith("```")) {
          text = text.replace(/```json|```/g, "").trim();
        }
        const data = JSON.parse(text);
        topic = data.topic;
        blogTitleSuggestion = data.title;
        log(`Decided to research: "${topic}" (Suggested Headline: "${blogTitleSuggestion}")`);
      } catch (parseError) {
        log(`Failed to parse suggested topic JSON. Response was: ${topicResponse.text}`);
        // Fallback topic
        topic = "croissant origin";
        log(`Using default fallback topic: "${topic}"`);
      }
    } else {
      log(`Using user-specified topic: "${topic}"`);
    }
    
    // Step 2: Research via Gemini with Google Search Grounding
    log(`Querying Gemini Flash with Google Search Grounding to research "${topic}"...`);
    const researchPrompt = `You are a meticulous investigative researcher. Perform exhaustive research on the topic: "${topic}".
    Using the Google Search tool, find the authentic origins, key dates, historical context, notable figures, common myths, and surprising trivia.
    Provide a detailed factual report. Make sure to identify specific references and citations where appropriate.`;
    
    const researchResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: researchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    
    const researchText = researchResponse.text;
    log("Research phase complete. Google Search Grounding successfully fetched sources.");
    
    // Step 3: Compile research into structured Blog Post JSON
    log("Compiling research into a structured blog post via Gemini...");
    const blogPrompt = `You are an expert creative blogger and historian. Take the following research about "${topic}":
    
    ${researchText}
    
    Transform this research into a gorgeous, highly engaging blog post.
    Format the response as a JSON object matching this schema:
    {
      "title": "A catchy, interesting, click-worthy headline",
      "category": "A single-word or two-word category, e.g., 'Food & Drink', 'Culture', 'Language', 'Inventions'",
      "summary": "A brief, compelling hook summarizing the article (1-2 sentences)",
      "sections": [
        {
          "heading": "Section Title",
          "content": "Paragraph content in Markdown format. Use bold, italics, or lists where appropriate. Must be rich and engaging."
        }
      ],
      "funFacts": [
        "A short, surprising trivia point.",
        "Another short, surprising trivia point."
      ],
      "imageKeywords": [
        "A very simple, broad 1-2 word search term for the cover photo (e.g., 'sauce' or 'potatoes' - avoid names, long sentences, or rare items)",
        "A very simple, broad 1-2 word search term for a secondary photo (e.g., 'chemist' or 'factory')",
        "A very simple, broad 1-2 word search term for a third photo (e.g., 'spices' or 'cooking')"
      ],
      "citations": [
        "URL 1 used in the research",
        "URL 2 used in the research"
      ]
    }
    
    Ensure the content is detailed, historically accurate, and written in a captivating storytelling voice.
    Do not include any JSON wrapper other than the JSON object itself. Do not write markdown tags around it.`;
    
    const blogResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: blogPrompt,
      config: {
        responseMimeType: 'application/json',
      }
    });
    
    let postData;
    try {
      let text = blogResponse.text.trim();
      if (text.startsWith("```")) {
        text = text.replace(/```json|```/g, "").trim();
      }
      postData = JSON.parse(text);
    } catch (parseError) {
      log(`Failed to parse blog post JSON. Response was: ${blogResponse.text}`);
      throw new Error("Invalid JSON returned from Gemini compiler.");
    }
    
    log(`Blog post compiled: "${postData.title}"`);
    
    // Step 4: Crawl and Download Images
    const postId = `${Date.now()}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    postData.id = postId;
    postData.topic = topic;
    postData.date = new Date().toISOString();
    postData.images = [];
    
    const keywords = postData.imageKeywords || [topic];
    log(`Attempting to fetch ${keywords.length} images for the post...`);
    
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      const imageUrl = await getUnsplashImage(keyword);
      const fileName = `${postId}-${i}.jpg`;
      const destPath = path.join(imagesDir, fileName);
      
      const success = await downloadImage(imageUrl, destPath);
      if (success) {
        // Serve locally from /images/ folder
        postData.images.push(`/images/${fileName}`);
      } else {
        // Fallback to LoremFlickr directly in the image src
        postData.images.push(imageUrl);
      }
    }
    
    // Step 5: Save post to database
    log("Saving post to data/posts.json...");
    const postsPath = path.join(dataDir, 'posts.json');
    let posts = [];
    if (fs.existsSync(postsPath)) {
      try {
        posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
      } catch (e) {
        log(`Error reading existing posts.json, resetting: ${e.message}`);
      }
    }
    
    // Add to the beginning of the feed (newest first)
    posts.unshift(postData);
    fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
    
    log(`Success! Agent run completed. New blog post "${postData.title}" is now live.`);
    return postData;
  } catch (error) {
    log(`FATAL ERROR during agent execution: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

// If run directly from CLI (e.g. node agent.js "croissant origin")
if (require.main === module) {
  const argTopic = process.argv[2] || null;
  runAgent(argTopic);
}

module.exports = { runAgent };
