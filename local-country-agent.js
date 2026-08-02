const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

require('dotenv').config();

const postsPath = path.join(__dirname, 'public/country-posts.json');

async function generateCountryData(ai, country, avoidList = "") {
  console.log(`Generating data for: ${country}`);

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
  
  return JSON.parse(text);
}

async function runLocalCountryAgent() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY is not set.");
    return;
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    // 1. In local testing, let's process "Portugal" and "Spain" as defaults
    const countries = ["Portugal", "Spain"];
    console.log(`Running local country agent for: ${countries.join(", ")}`);

    let existingPosts = [];
    if (fs.existsSync(postsPath)) {
      try {
        existingPosts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
      } catch (e) {
        console.warn("Could not read country-posts.json, starting fresh.");
      }
    }

    const newPosts = [];
    for (const country of countries) {
      try {
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
        console.error(`Error generating data for ${country}:`, err.message);
      }
    }

    if (newPosts.length === 0) {
      console.log("No new country posts generated.");
      return;
    }

    existingPosts = [...newPosts, ...existingPosts];
    fs.writeFileSync(postsPath, JSON.stringify(existingPosts, null, 2), 'utf8');
    console.log(`Local country agent run completed. Saved to ${postsPath}`);

  } catch (error) {
    console.error("Fatal error running local country agent:", error.message);
  }
}

if (require.main === module) {
  runLocalCountryAgent();
}

module.exports = { runLocalCountryAgent };
