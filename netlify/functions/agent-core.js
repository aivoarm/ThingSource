const { GoogleGenAI } = require("@google/genai");
const { getStore } = require("@netlify/blobs");
const { Resend } = require("resend");

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithFallback(ai, geminiParams, claudePromptOverride = null) {
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
    
    const promptContent = claudePromptOverride || geminiParams.contents;
    
    const claudeRes = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ 
          role: "user", 
          content: promptContent 
        }],
      }),
    }, 15000); // Allow 15 seconds for Claude fallback
    
    const data = await claudeRes.json();
    if (!claudeRes.ok) throw new Error(data.error?.message || "Claude API error");
    console.log("Model used: Claude (fallback)");
    return data.content[0].text;
  }
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
    { "heading": "Section title", "content": "Full paragraph" },
    { "heading": "Section title", "content": "Full paragraph" },
    { "heading": "Section title", "content": "Full paragraph" }
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
    { "heading": "Section title", "content": "Full paragraph" },
    { "heading": "Section title", "content": "Full paragraph" },
    { "heading": "Section title", "content": "Full paragraph" }
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

  // a. GET the current posts.json from GitHub to retrieve its SHA:
  const currentRes = await fetchWithTimeout(repoPath, { headers }, 10000);
  if (!currentRes.ok) {
    throw new Error(`Failed to fetch posts.json from GitHub. Status: ${currentRes.status}`);
  }
  const current = await currentRes.json();
  const existingPosts = current.content
    ? JSON.parse(Buffer.from(current.content, "base64").toString("utf8"))
    : [];

  // c. Prepend the new post to the array (newest first)
  const updatedPosts = [postData, ...existingPosts];
  const newContent = Buffer.from(JSON.stringify(updatedPosts, null, 2)).toString("base64");

  // d. PUT the updated file back
  const putRes = await fetchWithTimeout(repoPath, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `feat: add post "${postData.title}"`,
      content: newContent,
      sha: current.sha,
      branch: process.env.GITHUB_BRANCH || "main",
    }),
  }, 10000);

  if (!putRes.ok) {
    throw new Error(`Failed to commit posts.json to GitHub. Status: ${putRes.status}`);
  }
  log("Successfully committed to GitHub.");

  // Step 5: Send emails to all subscribers
  log("Fetching subscribers from Netlify Blobs...");
  const store = getStore({
    name: "subscribers",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  });
  const { blobs } = await store.list();
  console.log("Subscribers found:", blobs.length);
  console.log("Blob keys:", blobs.map(b => b.key));

  if (blobs.length === 0) {
    log("No subscribers found. Skipping email sending.");
  } else {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const siteUrl = "https://thingsource.netlify.app";
    const postUrl = `${siteUrl}/blog/?id=${postData.id}`;
    
    const firstSection = postData.sections?.[0];
    const previewText = firstSection ? firstSection.content.substring(0, 300) : "";

    // Send in batches of 100 (Resend free tier limit is 100/day)
    const batchSize = 100;
    for (let i = 0; i < blobs.length; i += batchSize) {
      const batch = blobs.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (blob) => {
          try {
            const raw = await store.get(blob.key);
            const subscriberData = JSON.parse(raw || "{}");
            console.log("Subscriber:", subscriberData.email);
            if (!subscriberData.email) return;

            const unsubUrl = `${siteUrl}/.netlify/functions/unsubscribe?token=${subscriberData.token}`;

            const sendPromise = resend.emails.send({
              from: process.env.RESEND_FROM || "onboarding@resend.dev",
              to: subscriberData.email,
              subject: postData.title,
              html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1>${postData.title}</h1>
  <p><strong>${postData.summary}</strong></p>
  <p>${previewText}...</p>
  <div style="margin:24px 0;">
    <a href="${postUrl}" style="background:#1a1a1a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Read full post</a>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="font-size:12px;color:#999;">
    You received this email because you subscribed to ThingSource.<br>
    <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
  </p>
</body>
</html>`
            });

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Resend timeout")), 10000)
            );

            await Promise.race([sendPromise, timeoutPromise]);
          } catch (err) {
            log(`Failed to send email to ${blob.key}: ${err.message}`);
          }
        })
      );
    }
    log(`Emailed ${blobs.length} subscribers.`);
  }

  // Step 6: Ping the healthcheck
  if (process.env.HEALTHCHECK_URL) {
    log("Pinging healthcheck...");
    await fetchWithTimeout(process.env.HEALTHCHECK_URL, {}, 5000).catch(() => {});
  }

  log("Agent execution finished successfully.");
  return postData;
}

module.exports = { runAgent };
