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

async function generateWithFallback(ai, geminiParams, claudePromptOverride = null) {
  const promptContent = claudePromptOverride || geminiParams.contents;

  if (process.env.USE_CLAUDE_PRIMARY === "true") {
    log("Using Claude as primary model...");
    return await callClaude(promptContent);
  }

  try {
    const response = await ai.models.generateContent(geminiParams);
    log("Model used: Gemini");
    return response.text;
  } catch (err) {
    const is429 = err.message?.includes("429") || 
                  err.message?.includes("RESOURCE_EXHAUSTED") ||
                  err.message?.includes("quota");
    
    if (!is429 || !process.env.ANTHROPIC_API_KEY) throw err;
    
    log("Gemini rate limited. Falling back to Claude...");
    return await callClaude(promptContent);
  }
}

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Claude API error");
  log("Model used: Claude");
  return data.content[0].text;
}

async function runAgent(customTopic = null) {
  initLog();
  log("Starting ThingSource Agent run...");
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("your_")) {
    log("ERROR: GEMINI_API_KEY is not set or is invalid.");
    return false;
  }
  
  try {
    const ai = new GoogleGenAI({ apiKey });

    // Combined Prompt
    const prompt = `You are a research blogger with access to Google Search.

Do all of the following in one response:

1. Pick one surprising, specific origin story of an everyday thing (food, word, custom, invention). Choose something genuinely interesting and not commonly known. ${customTopic ? `Specifically research: "${customTopic}"` : ''}

2. Use Google Search to research it thoroughly — find authentic origins, key dates, historical context, notable figures, common myths, and surprising trivia.

3. Write a complete blog post about it.

Return ONLY a raw JSON object with no markdown, no backticks:
{
  "topic": "the search term you used",
  "title": "Catchy headline",
  "category": "Food & Drink | Culture | Language | Inventions | Science",
  "summary": "1-2 sentence compelling hook",
  "sections": [
    { "heading": "Section title", "content": "2-3 sentence paragraph" },
    { "heading": "Section title", "content": "2-3 sentence paragraph" }
  ],
  "funFacts": ["fact 1", "fact 2", "fact 3"],
  "imageKeywords": ["simple keyword", "simple keyword"],
  "citations": ["url1", "url2"]
}`;

    const claudePromptOverride = `You are a research blogger.

Do all of the following in one response:

1. Pick one surprising, specific origin story of an everyday thing (food, word, custom, invention). Choose something genuinely interesting and not commonly known. ${customTopic ? `Specifically research: "${customTopic}"` : ''}

2. Using your training knowledge, research the topic thoroughly — find authentic origins, key dates, historical context, notable figures, common myths, and surprising trivia.

3. Write a complete blog post about it.

Return ONLY a raw JSON object with no markdown, no backticks:
{
  "topic": "the term you chose",
  "title": "Catchy headline",
  "category": "Food & Drink | Culture | Language | Inventions | Science",
  "summary": "1-2 sentence compelling hook",
  "sections": [
    { "heading": "Section title", "content": "2-3 sentence paragraph" },
    { "heading": "Section title", "content": "2-3 sentence paragraph" }
  ],
  "funFacts": ["fact 1", "fact 2", "fact 3"],
  "imageKeywords": ["simple keyword", "simple keyword"],
  "citations": ["url1", "url2"]
}`;

    log("Executing research and blog post compilation in a single call...");
    let responseText;
    try {
      responseText = await generateWithFallback(ai, {
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
        },
      }, claudePromptOverride);
    } catch (err) {
      log(`Failed generation phase: ${err.message}`);
      throw err;
    }

    let postData;
    try {
      let text = responseText.trim();
      if (text.startsWith("```")) {
        text = text.replace(/```json|```/g, "").trim();
      }
      postData = JSON.parse(text);
    } catch (parseError) {
      log(`Failed to parse blog post JSON. Response was: ${responseText}`);
      throw new Error("Invalid JSON returned from compiler.");
    }

    const topic = postData.topic || "unknown origin";
    const postId = `${Date.now()}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    postData.id = postId;
    postData.date = new Date().toISOString();
    
    // Store Unsplash URLs directly locally as well
    const keyword = postData.imageKeywords?.[0] || topic;
    postData.images = [`https://images.unsplash.com/featured/?${encodeURIComponent(keyword)}`];

    log(`Generated post: "${postData.title}"`);
    
    // Save post to database locally
    log("Saving post to public/posts.json...");
    const postsPath = path.join(publicDir, 'posts.json');
    let posts = [];
    if (fs.existsSync(postsPath)) {
      try {
        posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
      } catch (e) {
        log(`Error reading existing posts.json, resetting: ${e.message}`);
      }
    }
    
    posts.unshift(postData);
    fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2), 'utf8');
    
    log(`Success! Agent run completed. New blog post "${postData.title}" is now live.`);
    return postData;
  } catch (error) {
    log(`FATAL ERROR during agent execution: ${error.message}`);
    return false;
  }
}

// If run directly from CLI (e.g. node agent.js "croissant origin")
if (require.main === module) {
  const argTopic = process.argv[2] || null;
  runAgent(argTopic);
}

module.exports = { runAgent };
