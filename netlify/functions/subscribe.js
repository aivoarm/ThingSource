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

    // Capture subscriber preferences
    const preferences = body.preferences || {
      thingsource: true,
      science: true,
      countries: []
    };

    const store = getStore({
      name: "subscribers",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN,
    });
    const key = "email:" + email.toLowerCase();

    // Check if already subscribed in the confirmed store
    const existing = await store.get(key).catch(() => null);
    if (existing) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: "Already subscribed!" })
      };
    }

    // Generate confirmation token
    const token = crypto.randomBytes(32).toString("hex");

    // Save to pending_subscribers store using token as the key for fast O(1) retrieval
    const pendingStore = getStore({
      name: "pending_subscribers",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN,
    });

    await pendingStore.set(token, JSON.stringify({
      email,
      preferences,
      createdAt: new Date().toISOString()
    }));

    // Send confirmation email via Resend
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const siteUrl = "https://ts.armanayva.com";
      const confirmUrl = `${siteUrl}/.netlify/functions/confirm-subscription?token=${token}`;

      await resend.emails.send({
        from: process.env.RESEND_FROM || "ThingSource <thingsource@ts.armanayva.com>",
        to: email,
        subject: "Confirm your subscription to ThingSource",
        html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1c1c1e; background-color: #ffffff; }
    .container { padding: 32px 24px; border: 1px solid #e7e2d4; border-radius: 12px; background-color: #fcfbfa; }
    h1 { font-family: Georgia, serif; font-size: 24px; margin-top: 0; color: #0d7a6b; }
    p { font-size: 15px; line-height: 1.6; color: #444; }
    .btn-container { margin: 32px 0; text-align: center; }
    .btn { display: inline-block; background-color: #0d7a6b; color: #ffffff !important; text-decoration: none; font-weight: bold; font-size: 16px; padding: 14px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .footer { font-size: 12px; color: #999; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Confirm your subscription</h1>
    <p>Thank you for signing up for ThingSource! Please click the button below to confirm your subscription and start receiving daily origin stories, science snippets, and country facts in your inbox.</p>
    <div class="btn-container">
      <a href="${confirmUrl}" class="btn">Confirm Subscription</a>
    </div>
    <p style="font-size: 13px; color: #666;">If the button doesn't work, copy and paste this URL into your browser:</p>
    <p style="font-size: 13px; color: #0d7a6b; word-break: break-all;"><a href="${confirmUrl}" style="color: #0d7a6b;">${confirmUrl}</a></p>
    <div class="footer">
      You received this because you requested to subscribe to ThingSource. If you did not make this request, you can safely ignore this email.
    </div>
  </div>
</body>
</html>`
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Please check your inbox to confirm your subscription." })
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
