const { GoogleGenAI } = require("@google/genai");
const { getStore } = require("@netlify/blobs");

async function generateCountryData(ai, country, avoidList = "") {
  console.log(`[country-agent] Generating data for: ${country}`);

  const prompt = `You are a travel journalist and cultural researcher.
Produce a daily digest about the country: ${country}.
Research the following:
1. A fascinating, lesser-known historical or geographical fact about ${country}.
2. A cultural custom, tradition, food origin, or holiday unique to ${country}.
3. A brief, positive/interesting recent news or current event summary about ${country} (use search grounding to find real, verified recent news from the last few months).

IMPORTANT: Make sure the content is completely different from these recently covered topics:
${avoidList}

Do all of the following in one response. Return ONLY a raw JSON object with no markdown and no backticks:
{
  "country": "${country}",
  "fact": {
    "title": "Title of the fact",
    "content": "2-3 engaging sentences explaining the fact."
  },
  "culture": {
    "title": "Title of the cultural custom or food",
    "content": "2-3 engaging sentences explaining the custom, food, or tradition."
  },
  "news": {
    "title": "Recent News Title",
    "content": "2-3 sentences summarizing a real, recent positive or interesting news story about ${country}.",
    "url": "A real, direct public news website source URL (e.g. BBC, Reuters, or local news). Do NOT use internal Google Cloud 'vertexaisearch.cloud.google.com' links."
  }
}`;

  // Configure GenAI to use search grounding
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  let text = response.text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/```json|```/g, "").trim();
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("[country-agent] Failed to parse JSON from response:", text);
    throw err;
  }
}

async function runCountryAgent() {
  console.log("[country-agent] Starting run...");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required.");
  }
  const ai = new GoogleGenAI({ apiKey });

  // 1. Determine active countries from subscribers Blob store
  console.log("[country-agent] Fetching subscriber list to find active countries...");
  const activeCountries = new Set(["Portugal"]); // Seed country always active
  try {
    const store = getStore({
      name: "subscribers",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN,
    });
    const { blobs } = await store.list();
    for (const blob of blobs) {
      try {
        const raw = await store.get(blob.key);
        const sub = JSON.parse(raw || "{}");
        if (sub.preferences && Array.isArray(sub.preferences.countries)) {
          sub.preferences.countries.forEach(c => {
            if (c && typeof c === "string") {
              activeCountries.add(c.trim());
            }
          });
        }
      } catch (err) {
        // ignore individual parse errors
      }
    }
  } catch (err) {
    console.warn("[country-agent] Failed to query Netlify Blobs for active countries. Using default: Portugal.", err.message);
  }

  const countriesList = Array.from(activeCountries);
  console.log(`[country-agent] Active countries to process: ${countriesList.join(", ")}`);

  // 2. Fetch existing country posts from GitHub
  console.log("[country-agent] Fetching country-posts.json from GitHub...");
  const repoPath = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/public/country-posts.json`;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "User-Agent": "ThingSource-Country-Agent"
  };

  const getController = new AbortController();
  const getTimeout = setTimeout(() => getController.abort(), 15000);
  
  let existingPosts = [];
  let currentSha = null;

  try {
    const currentRes = await fetch(repoPath, { headers, signal: getController.signal });
    clearTimeout(getTimeout);
    
    if (currentRes.ok) {
      const current = await currentRes.json();
      existingPosts = current.content
        ? JSON.parse(Buffer.from(current.content, "base64").toString("utf8"))
        : [];
      currentSha = current.sha;
    } else if (currentRes.status === 404) {
      console.log("[country-agent] country-posts.json not found on GitHub. Creating new file.");
    } else {
      console.warn(`[country-agent] Failed to fetch country-posts.json. Status: ${currentRes.status}`);
    }
  } catch (err) {
    console.error("[country-agent] Error checking remote country-posts.json:", err.message);
  }

  // 3. Generate data for each country
  const newPosts = [];
  for (const country of countriesList) {
    try {
      // Find recently covered topics for this country
      const countryHistory = existingPosts.filter(p => p.country.toLowerCase() === country.toLowerCase());
      const avoidTitles = countryHistory
        .flatMap(p => [p.fact?.title, p.culture?.title, p.news?.title])
        .filter(Boolean)
        .slice(0, 30);
      
      const avoidList = avoidTitles.map(t => `- "${t}"`).join("\n");

      const generated = await generateCountryData(ai, country, avoidList);
      generated.id = `${Date.now()}-${country.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      generated.date = new Date().toISOString();
      
      newPosts.push(generated);
    } catch (err) {
      console.error(`[country-agent] Failed to process ${country}:`, err.message);
    }
  }

  if (newPosts.length === 0) {
    console.log("[country-agent] No new country posts generated. Exiting.");
    return;
  }

  // Combine and commit updated content to GitHub
  const updatedPosts = [...newPosts, ...existingPosts];
  const newContent = Buffer.from(JSON.stringify(updatedPosts, null, 2)).toString("base64");

  console.log("[country-agent] Committing updated country-posts.json to GitHub...");
  const putController = new AbortController();
  const putTimeout = setTimeout(() => putController.abort(), 15000);
  const putRes = await fetch(repoPath, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `feat: add country digests for ${newPosts.map(p => p.country).join(", ")}`,
      content: newContent,
      sha: currentSha || undefined, // undefined if creating a new file
      branch: process.env.GITHUB_BRANCH || "main",
    }),
    signal: putController.signal
  });
  clearTimeout(putTimeout);

  if (!putRes.ok) {
    throw new Error(`Failed to commit country-posts.json to GitHub. Status: ${putRes.status}`);
  }
  console.log("[country-agent] Successfully committed country-posts.json to GitHub.");
}

module.exports = { runCountryAgent };
