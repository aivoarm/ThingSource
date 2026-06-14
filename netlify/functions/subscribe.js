const { getStore } = require("@netlify/blobs");
const { Resend } = require("resend");
const crypto = require("crypto");

exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // Handle OPTIONS preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
    };
  }

  // Only accept POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (err) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid JSON body" })
      };
    }

    const email = (body.email || "").trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid email address" })
      };
    }

    const store = getStore({
      name: "subscribers",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN,
    });
    const key = "email:" + email.toLowerCase();

    // Check if already subscribed
    const existing = await store.get(key).catch(() => null);
    if (existing) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: "Already subscribed!" })
      };
    }

    // Generate unsubscribe token
    const token = crypto.randomBytes(32).toString("hex");

    // Save to Netlify Blobs
    await store.set(key, JSON.stringify({
      email,
      token,
      subscribedAt: new Date().toISOString()
    }));

    // Send welcome email via Resend
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const siteUrl = "https://thingsource.netlify.app";
      const unsubUrl = `${siteUrl}/.netlify/functions/unsubscribe?token=${token}`;

      await resend.emails.send({
        from: process.env.RESEND_FROM || "ThingSource <thingsource@ts.armanayva.com>",
        to: email,
        subject: "You're subscribed to ThingSource",
        html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1>Welcome to ThingSource!</h1>
  <p>Thank you for subscribing. You'll receive one surprising origin story of an everyday thing in your inbox every morning.</p>
  <p>Visit the blog at <a href="${siteUrl}">${siteUrl}</a> to view the archive.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="font-size:12px;color:#999;">
    You received this email because you subscribed to ThingSource.<br>
    <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
  </p>
</body>
</html>`
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Subscribed! Check your inbox." })
    };
  } catch (error) {
    console.error("Error in subscribe function:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
