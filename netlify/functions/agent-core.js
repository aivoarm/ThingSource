const { GoogleGenAI } = require("@google/genai");

async function generateWithFallback(ai, geminiParams, claudePromptOverride = null) {
  const promptContent = claudePromptOverride || geminiParams.contents;

  if (process.env.USE_CLAUDE_PRIMARY === "true") {
    console.log("Using Claude as primary model...");
    return await callClaude(promptContent);
  }

  try {
    const response = await ai.models.generateContent(geminiParams);
    console.log("Model used: Gemini");
    return response.text;
  } catch (err) {
    const is429 = err.message?.includes("429") || 
                  err.message?.includes("RESOURCE_EXHAUSTED") ||
                  err.message?.includes("quota");
    
    if (!is429 || !process.env.ANTHROPIC_API_KEY) throw err;
    
    console.log("Gemini rate limited. Falling back to Claude...");
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
  console.log("Model used: Claude");
  return data.content[0].text;
}

async function runAgent() {
  const log = (msg) => console.log(`[agent] ${msg}`);
  log("Starting agent execution...");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You are a research blogger with access to Google Search.

Do all of the following in one response:

1. Pick one surprising, specific origin story of an everyday thing (food, word, custom, invention). Choose something genuinely interesting and not commonly known.

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

1. Pick one surprising, specific origin story of an everyday thing (food, word, custom, invention). Choose something genuinely interesting and not commonly known.

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
  
  // Store Unsplash URLs directly
  const keyword = postData.imageKeywords?.[0] || topic;
  postData.images = [`https://images.unsplash.com/featured/?${encodeURIComponent(keyword)}`];

  log(`Generated post: "${postData.title}"`);

  // Step 4: Commit post to GitHub
  log("Committing to GitHub...");
  const repoPath = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/public/posts.json`;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "User-Agent": "ThingSource-Agent"
  };

  // GitHub GET with 15s timeout
  const getController = new AbortController();
  const getTimeout = setTimeout(() => getController.abort(), 15000);
  const currentRes = await fetch(repoPath, { 
    headers,
    signal: getController.signal
  });
  clearTimeout(getTimeout);

  if (!currentRes.ok) {
    throw new Error(`Failed to fetch posts.json from GitHub. Status: ${currentRes.status}`);
  }
  const current = await currentRes.json();
  const existingPosts = current.content
    ? JSON.parse(Buffer.from(current.content, "base64").toString("utf8"))
    : [];

  // Prepend the new post to the array (newest first)
  const updatedPosts = [postData, ...existingPosts];
  const newContent = Buffer.from(JSON.stringify(updatedPosts, null, 2)).toString("base64");

  // GitHub PUT with 15s timeout
  const putController = new AbortController();
  const putTimeout = setTimeout(() => putController.abort(), 15000);
  const putRes = await fetch(repoPath, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `feat: add post "${postData.title}"`,
      content: newContent,
      sha: current.sha,
      branch: process.env.GITHUB_BRANCH || "main",
    }),
    signal: putController.signal
  });
  clearTimeout(putTimeout);

  if (!putRes.ok) {
    throw new Error(`Failed to commit posts.json to GitHub. Status: ${putRes.status}`);
  }
  log("Successfully committed to GitHub.");

  // Fire and forget send-emails call — do not await this
  fetch("https://thingsource.netlify.app/.netlify/functions/send-emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postData),
  }).then(() => {
    log("Post committed. Email send delegated.");
  }).catch(err => {
    console.log("Email dispatch error:", err.message);
  });

  // Step 6: Ping the healthcheck
  if (process.env.HEALTHCHECK_URL) {
    log("Pinging healthcheck...");
    // 5s timeout on healthcheck ping
    const hcController = new AbortController();
    const hcTimeout = setTimeout(() => hcController.abort(), 5000);
    await fetch(process.env.HEALTHCHECK_URL, { signal: hcController.signal }).catch(() => {});
    clearTimeout(hcTimeout);
  }

  log("Agent execution finished successfully.");
  return postData;
}

module.exports = { runAgent };
