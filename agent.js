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
    return { text: await callClaude(promptContent), model: "Claude" };
  }

  if (process.env.USE_GROQ_PRIMARY === "true") {
    log("Using Groq as primary model...");
    return { text: await callGroq(promptContent), model: "Groq" };
  }

  try {
    const response = await ai.models.generateContent(geminiParams);
    log("Model used: Gemini");
    return { text: response.text, model: "Gemini" };
  } catch (err) {
    const is429 = err.message?.includes("429") || 
                  err.message?.includes("RESOURCE_EXHAUSTED") ||
                  err.message?.includes("quota");
    
    if (!is429) throw err;
    
    if (process.env.GROQ_KEY) {
      try {
        log("Gemini rate limited. Falling back to Groq...");
        return { text: await callGroq(promptContent), model: "Groq" };
      } catch (groqErr) {
        log(`Groq fallback failed: ${groqErr.message}`);
      }
    }

    if (process.env.ANTHROPIC_API_KEY) {
      log("Falling back to Claude...");
      return { text: await callClaude(promptContent), model: "Claude" };
    }

    throw err;
  }
}

async function callGroq(prompt) {
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" }
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Groq API error");
  log(`Model used: Groq (${model})`);
  return data.choices[0].message.content;
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

function isTooSimilar(newPost, existingPosts) {
  const newTitle = newPost.title.toLowerCase();
  const newTopic = (newPost.topic || "").toLowerCase();
  
  return existingPosts.some(p => {
    const existingTitle = (p.title || "").toLowerCase();
    const existingTopic = (p.topic || "").toLowerCase();
    
    // Check for shared significant words (4+ chars)
    const newWords = newTitle.split(" ")
      .filter(w => w.length > 4);
    const titleOverlap = newWords
      .filter(w => existingTitle.includes(w)).length;
    
    return existingTopic === newTopic || titleOverlap >= 3;
  });
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

    // Step 1: Read existing posts locally to prevent duplicates and nudge category rotation
    log("Reading existing posts locally...");
    const postsPath = path.join(publicDir, 'posts.json');
    let existingPosts = [];
    if (fs.existsSync(postsPath)) {
      try {
        existingPosts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
      } catch (e) {
        log(`Error reading existing posts.json, resetting: ${e.message}`);
      }
    }

    // Extract previous topics
    const usedTopics = existingPosts
      .map(p => p.topic || p.title)
      .filter(Boolean)
      .slice(0, 50); // last 50 is enough context

    const avoidList = usedTopics.join(", ");

    // Category rotation
    const recentCategories = existingPosts
      .slice(0, 7)
      .map(p => p.category);

    const categoryCounts = recentCategories.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const overusedCategories = Object.entries(categoryCounts)
      .filter(([_, count]) => count >= 2)
      .map(([cat]) => cat);

    let categoryNudge = "";
    if (overusedCategories.length > 0) {
      categoryNudge = `\nAlso avoid these categories that have appeared too recently: ${overusedCategories.join(", ")}.\nPick a category from: Food & Drink, Language, Culture, Inventions, Science, History, Geography — whichever has not appeared recently.`;
    }

    // Combined Prompt
    const prompt = `You are a research blogger with access to Google Search.

Do all of the following in one response:

1. Pick one surprising, specific origin story of an everyday thing (food, word, custom, invention). Choose something genuinely interesting and not commonly known. ${customTopic ? `Specifically research: "${customTopic}"` : ''}

IMPORTANT: Do NOT pick any of these topics that have already been covered:
${avoidList}

Choose something completely different and not on that list.${categoryNudge}

2. Use Google Search to research it thoroughly — find authentic origins, key dates, historical context, notable figures, common myths, and surprising trivia.

3. Write a complete blog post about it.

ANTI-HALLUCINATION & RELEVANCY INSTRUCTIONS:
- Do NOT invent, fabricate, or hallucinate historical facts, dates, names, or quotes. All content must be historically accurate, realistic, and verifiable.
- Do NOT make up or guess citation URLs. Only include real, verified URLs that actually exist and directly reference the facts. Do NOT use placeholder domains or fake IDs.
- If there is a popular myth or common misconception associated with the topic, explicitly address and debunk it using verified historical facts.
- Choose highly descriptive, specific, and distinct imageKeywords (e.g. ["Post-it note yellow", "Spencer Silver 3M office"] instead of ["office", "paper"]) to help the image search engine find highly relevant photos.

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

IMPORTANT: Do NOT pick any of these topics that have already been covered:
${avoidList}

Choose something completely different and not on that list.${categoryNudge}

2. Using your training knowledge, research the topic thoroughly — find authentic origins, key dates, historical context, notable figures, common myths, and surprising trivia.

3. Write a complete blog post about it.

ANTI-HALLUCINATION & RELEVANCY INSTRUCTIONS:
- Do NOT invent, fabricate, or hallucinate historical facts, dates, names, or quotes. All content must be historically accurate, realistic, and verifiable.
- Do NOT make up or guess citation URLs. Only include real, verified URLs that actually exist and directly reference the facts. Do NOT use placeholder domains or fake IDs.
- If there is a popular myth or common misconception associated with the topic, explicitly address and debunk it using verified historical facts.
- Choose highly descriptive, specific, and distinct imageKeywords (e.g. ["Post-it note yellow", "Spencer Silver 3M office"] instead of ["office", "paper"]) to help the image search engine find highly relevant photos.

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

    let postData;
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      log(`Executing research and blog post compilation (attempt ${attempts})...`);
      let responseText;
      let modelUsed;
      try {
        const responseObj = await generateWithFallback(ai, {
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }]
          },
        }, claudePromptOverride);
        responseText = responseObj.text;
        modelUsed = responseObj.model;
      } catch (err) {
        log(`Failed generation phase: ${err.message}`);
        throw err;
      }

      try {
        let text = responseText.trim();
        if (text.startsWith("```")) {
          text = text.replace(/```json|```/g, "").trim();
        }
        postData = JSON.parse(text);
      } catch (parseError) {
        log(`Failed to parse blog post JSON. Response was: ${responseText}`);
        if (attempts >= 2) throw new Error("Invalid JSON returned from compiler.");
        continue;
      }

      if (isTooSimilar(postData, existingPosts)) {
        log("Too similar to existing post. Regenerating...");
        if (attempts >= 2) {
          log("Max regeneration attempts reached. Proceeding with current post to avoid loop.");
          postData.aiSource = modelUsed;
          break;
        }
      } else {
        postData.aiSource = modelUsed;
        break;
      }
    }

    if (postData.citations && Array.isArray(postData.citations)) {
      postData.citations = [...new Set(postData.citations)].slice(0, 5);
    }

    const topic = postData.topic || "unknown origin";
    const postId = `${Date.now()}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    postData.id = postId;
    const slug = postData.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 60);
    postData.slug = slug;
    postData.date = new Date().toISOString();
    
    // Generate Joke of the Day
    log("Generating Joke of the Day...");
    const usedJokes = existingPosts
      .map(p => p.joke?.setup || p.joke?.joke)
      .filter(Boolean)
      .slice(0, 50);
    const avoidJokesList = usedJokes.length > 0 ? `\n\nIMPORTANT: Do NOT pick any of these jokes that have already been used:\n${usedJokes.map(j => `- "${j}"`).join("\n")}\nChoose a completely different joke.` : '';

    const jokePrompt = `You are a modern comedy writer and curator.
Deliver one genuinely funny, clever, and sharp joke or one-liner. It must fit the style of modern stand-up comedy (dry, observational, self-deprecating, or slightly absurdist) rather than old-fashioned "dad jokes" or setup-punchline formats.

Good styles and sources of inspiration:
- Modern stand-up style (e.g., in the style of John Mulaney, Taylor Tomlinson, Demetri Martin, Mitch Hedberg, Nate Bargatze)
- Relatable, dry observations about modern life (e.g., career, technology, social interactions, existential dread)
- Clever wordplay or deadpan one-liners that subvert expectations at the very end

IMPORTANT: The joke must be genuinely funny and witty when read as text.
${avoidJokesList}

Return ONLY raw JSON, no markdown:
{
  "joke": "full joke text as a single cohesive line or setup/punchline combo",
  "setup": "setup line (can be empty if it is a pure one-liner)",
  "punchline": "punchline or twist (the entire joke text if it is a one-liner)",
  "comedian": "name of comedian (e.g., John Mulaney, Mitch Hedberg) OR 'Modern Observational' if written in that style",
  "year": "approximate year or 'Modern'",
  "context": "1-2 sentences explaining why this punchline is witty, relatable, or how it subverts expectations"
}`;

    try {
      const jokeResObj = await generateWithFallback(ai, {
        model: "gemini-2.5-flash",
        contents: jokePrompt,
        config: {
          tools: [{ googleSearch: {} }]
        },
      });
      let jokeText = jokeResObj.text.trim();
      if (jokeText.startsWith("```")) {
        jokeText = jokeText.replace(/```json|```/g, "").trim();
      }
      postData.joke = JSON.parse(jokeText);
      log("Successfully generated Joke of the Day.");
    } catch (e) {
      log(`Joke generation failed, skipping: ${e.message}`);
      postData.joke = null;
    }

    const { getBestImage } = require("./netlify/functions/utils/images.js");

    // Try to get a real image, fall back gracefully
    try {
      const imageUrl = await getBestImage({
        keywords: postData.imageKeywords,
        category: postData.category,
        id: postData.id,
        title: postData.topic,
      });
      postData.images = [imageUrl];
      log(`Image found: ${imageUrl.substring(0, 60)}`);
    } catch (err) {
      log(`Image fetch failed, will use default: ${err.message}`);
      postData.images = []; // frontend will use category default SVG
    }

    log(`Generated post: "${postData.title}"`);
    
    // Save post to database locally
    log("Saving post to public/posts.json...");
    existingPosts.unshift(postData);
    fs.writeFileSync(postsPath, JSON.stringify(existingPosts, null, 2), 'utf8');
    
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
