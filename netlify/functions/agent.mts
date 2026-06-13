import { schedule } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";
import { getStore } from "@netlify/blobs";
import { Resend } from "resend";

const CRON = "0 7 * * *"; // 7am UTC daily

export const handler = schedule(CRON, async () => {
  const log = (msg: string) => console.log(`[agent] ${msg}`);

  // ── STEP 1: Generate post with Gemini ──────────────────────────────────────
  log("Calling Gemini...");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `You are a research blogger. Pick one surprising, specific origin story of an everyday thing (food, word, custom, invention). Research it thoroughly and write an engaging blog post.

Return ONLY a raw JSON object (no markdown, no backticks) matching this exact schema:
{
  "topic": "short search phrase used",
  "title": "Catchy headline",
  "category": "Food & Drink | Culture | Language | Inventions | Science",
  "summary": "1-2 sentence compelling hook",
  "sections": [
    { "heading": "Section title", "content": "Full paragraph in markdown" }
  ],
  "funFacts": ["surprising fact 1", "surprising fact 2", "surprising fact 3"],
  "imageKeywords": ["simple 1-2 word term", "simple 1-2 word term"],
  "citations": ["url1", "url2"]
}`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
    },
  });

  const textClean = response.text ? response.text.replace(/```json/g, "").replace(/```/g, "").trim() : "{}";
  const postData = JSON.parse(textClean);
  const post = {
    id: `${Date.now()}-${postData.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    date: new Date().toISOString(),
    draft: false,
    ...postData,
  };
  log(`Generated: "${post.title}"`);

  // ── STEP 2: Commit post to GitHub ──────────────────────────────────────────
  log("Committing to GitHub...");
  const repoPath = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/public/posts.json`;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "User-Agent": "ThingSource-Agent"
  };

  // Fetch current file + its SHA (required by GitHub API to update)
  const currentRes = await fetch(repoPath, { headers });
  const current = await currentRes.json();
  const existingPosts = current.content
    ? JSON.parse(Buffer.from(current.content, "base64").toString("utf8"))
    : [];

  const updatedPosts = [post, ...existingPosts];
  const newContent = Buffer.from(JSON.stringify(updatedPosts, null, 2)).toString("base64");

  await fetch(repoPath, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `feat: add post "${post.title}"`,
      content: newContent,
      sha: current.sha,
      branch: process.env.GITHUB_BRANCH || "main",
    }),
  });
  log("Committed. Netlify redeploy triggered automatically.");

  // ── STEP 3: Email subscribers ──────────────────────────────────────────────
  log("Fetching subscribers...");
  const store = getStore("subscribers");
  const { blobs } = await store.list();

  if (blobs.length === 0) {
    log("No subscribers yet. Skipping email.");
  } else {
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const siteUrl = "https://thingsource.netlify.app";
    const postUrl = `${siteUrl}/blog/?id=${post.id}`;

    // Send in batches of 100 (Resend free tier: 100/day)
    const batchSize = 100;
    for (let i = 0; i < blobs.length; i += batchSize) {
      const batch = blobs.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (blob) => {
          const subscriber = JSON.parse(await store.get(blob.key) || "{}");
          if (!subscriber.email) return;

          const unsubUrl = `${siteUrl}/.netlify/functions/unsubscribe?token=${subscriber.token}`;

          await resend.emails.send({
            from: process.env.RESEND_FROM!,
            to: subscriber.email,
            subject: post.title,
            html: buildEmailHtml(post, postUrl, unsubUrl),
          });
        })
      );
    }
    log(`Emailed ${blobs.length} subscribers.`);
  }

  // ── STEP 4: Ping healthcheck ───────────────────────────────────────────────
  if (process.env.HEALTHCHECK_URL) {
    await fetch(process.env.HEALTHCHECK_URL).catch(() => {});
    log("Healthcheck pinged.");
  }

  log("Agent run complete.");
  return { statusCode: 200 };
});

// ── Email HTML template ────────────────────────────────────────────────────
function buildEmailHtml(post: any, postUrl: string, unsubUrl: string): string {
  const firstSection = post.sections?.[0];
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;color:#1a1a1a">
  <p style="font-size:12px;color:#888;margin:0 0 24px;text-transform:uppercase;letter-spacing:0.1em">ThingSource · ${post.category}</p>
  <h1 style="font-size:26px;line-height:1.3;margin:0 0 12px">${post.title}</h1>
  <p style="font-size:16px;color:#444;line-height:1.6;margin:0 0 20px">${post.summary}</p>
  ${firstSection ? `<p style="font-size:15px;line-height:1.7;margin:0 0 24px">${firstSection.content.substring(0, 300)}…</p>` : ""}
  ${post.funFacts?.[0] ? `<blockquote style="border-left:3px solid #e0e0e0;margin:0 0 24px;padding:8px 16px;color:#555;font-style:italic">${post.funFacts[0]}</blockquote>` : ""}
  <a href="${postUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;text-decoration:none;font-family:sans-serif;font-size:14px;border-radius:6px">Read full post →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #eee">
  <p style="font-size:12px;color:#aaa;text-align:center">
    You're receiving this because you subscribed to ThingSource.<br>
    <a href="${unsubUrl}" style="color:#aaa">Unsubscribe</a>
  </p>
</body>
</html>`;
}
