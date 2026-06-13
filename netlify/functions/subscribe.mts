import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { Resend } from "resend";
import crypto from "crypto";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const { email } = JSON.parse(event.body || "{}");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid email" }) };
  }

  const store = getStore("subscribers");
  const key = `email:${email.toLowerCase()}`;

  // Check if already subscribed
  const existing = await store.get(key).catch(() => null);
  if (existing) {
    return { statusCode: 200, body: JSON.stringify({ message: "Already subscribed!" }) };
  }

  const token = crypto.randomBytes(32).toString("hex");
  await store.set(key, JSON.stringify({ email, token, subscribedAt: new Date().toISOString() }));

  // Send welcome email
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const siteUrl = "https://thingsource.netlify.app";
  await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to: email,
    subject: "You're subscribed to ThingSource 🎉",
    html: `<p style="font-family:sans-serif;max-width:500px;margin:24px auto">
      Welcome to <strong>ThingSource</strong>! Every morning you'll get one surprising origin story in your inbox.
      <br><br>
      <a href="${siteUrl}">Visit the site</a> to read past posts.
      <br><br>
      <small style="color:#aaa">Don't want emails? <a href="${siteUrl}/.netlify/functions/unsubscribe?token=${token}">Unsubscribe</a></small>
    </p>`,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Subscribed! Check your inbox for a welcome email." }),
  };
};
