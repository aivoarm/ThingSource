import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async (event) => {
  const token = event.queryStringParameters?.token;
  if (!token) return { statusCode: 400, body: "Missing token" };

  const store = getStore("subscribers");
  const { blobs } = await store.list();

  let deleted = false;
  for (const blob of blobs) {
    const data = JSON.parse(await store.get(blob.key) || "{}");
    if (data.token === token) {
      await store.delete(blob.key);
      deleted = true;
      break;
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:500px;margin:80px auto;text-align:center">
      <h2>${deleted ? "You've been unsubscribed." : "Link not found or already used."}</h2>
      <p style="color:#666">${deleted ? "You won't receive any more emails from ThingSource." : "Your email may already have been removed."}</p>
      <a href="https://thingsource.netlify.app" style="color:#333">← Back to ThingSource</a>
    </body></html>`,
  };
};
