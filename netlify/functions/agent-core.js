const { GoogleGenAI } = require("@google/genai");
const { getStore } = require("@netlify/blobs");
const { Resend } = require("resend");

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
    
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
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
    });
    
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
  let topic = null;
  let blogTitleSuggestion = "";

  // Step 1: Autonomous Topic Selection
  log("Asking Gemini to select an interesting thing to research...");
  const topicPrompt = `Suggest one extremely interesting, specific, and slightly mysterious origin or source of an everyday thing (such as a food item, a common custom, an idiom, a widely used word, or a simple invention).
The suggestion must be suitable for a highly engaging history and trivia blog post.
Return ONLY a raw JSON object with two fields:
- "topic": The exact search query term (e.g., "margherita pizza origin" or "why we clink glasses")
- "title": A catchy headline for this research.
Do not wrap it in markdown block tags. Return only the raw JSON.`;

  let topicText;
  try {
    topicText = await generateWithFallback(ai, {
      model: 'gemini-2.5-flash',
      contents: topicPrompt,
    });
  } catch (err) {
    log(`Failed to select topic: ${err.message}`);
    throw err;
  }

  try {
    let text = topicText.trim();
    if (text.startsWith("```")) {
      text = text.replace(/```json|```/g, "").trim();
    }
    const data = JSON.parse(text);
    topic = data.topic;
    blogTitleSuggestion = data.title;
    log(`Decided to research: "${topic}" (Suggested Headline: "${blogTitleSuggestion}")`);
  } catch (parseError) {
    log(`Failed to parse suggested topic JSON. Using fallback. Response was: ${topicText}`);
    topic = "croissant origin";
  }

  // Step 2: Research via Gemini with Google Search Grounding
  log(`Querying Gemini Flash with Google Search Grounding to research "${topic}"...`);
  const researchPrompt = `You are a meticulous investigative researcher. Perform exhaustive research on the topic: "${topic}".
Using the Google Search tool, find the authentic origins, key dates, historical context, notable figures, common myths, and surprising trivia.
Provide a detailed factual report. Make sure to identify specific references and citations where appropriate.`;

  const claudeResearchPrompt = `Using your training knowledge, research the following topic thoroughly: ${topic}. Provide detailed origins, key dates, historical context, notable figures, and surprising trivia.`;

  let researchText;
  try {
    researchText = await generateWithFallback(ai, {
      model: 'gemini-2.5-flash',
      contents: researchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    }, claudeResearchPrompt);
  } catch (err) {
    log(`Failed research phase: ${err.message}`);
    throw err;
  }
  log("Research phase complete.");

  // Step 3: Compile research into structured Blog Post JSON
  log("Compiling research into a structured blog post...");
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

  let blogText;
  try {
    blogText = await generateWithFallback(ai, {
      model: 'gemini-2.5-flash',
      contents: blogPrompt,
      config: {
        responseMimeType: 'application/json',
      }
    });
  } catch (err) {
    log(`Failed to compile blog post: ${err.message}`);
    throw err;
  }

  let postData;
  try {
    let text = blogText.trim();
    if (text.startsWith("```")) {
      text = text.replace(/```json|```/g, "").trim();
    }
    postData = JSON.parse(text);
  } catch (parseError) {
    log(`Failed to parse blog post JSON. Response was: ${blogText}`);
    throw new Error("Invalid JSON returned from Gemini compiler.");
  }

  const postId = `${Date.now()}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  postData.id = postId;
  postData.topic = topic;
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
  const currentRes = await fetch(repoPath, { headers });
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
  const putRes = await fetch(repoPath, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `feat: add post "${postData.title}"`,
      content: newContent,
      sha: current.sha,
      branch: process.env.GITHUB_BRANCH || "main",
    }),
  });

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

            await resend.emails.send({
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
    await fetch(process.env.HEALTHCHECK_URL).catch(() => {});
  }

  log("Agent execution finished successfully.");
  return postData;
}

module.exports = { runAgent };
