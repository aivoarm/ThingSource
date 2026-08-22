const { getStore } = require("@netlify/blobs");
const { Resend } = require("resend");

exports.handler = async (event, context) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;

  const htmlResponse = (title, message, isSuccess = true) => {
    const accentColor = isSuccess ? "#0d7a6b" : "#d9381e";
    const emoji = isSuccess ? "✨" : "⚠️";
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — ThingSource</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #070913;
      color: #ffffff;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      max-width: 480px;
      width: 100%;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .icon {
      font-size: 48px;
      margin-bottom: 24px;
    }
    h2 {
      font-family: Georgia, serif;
      font-size: 24px;
      margin: 0 0 16px 0;
      color: #ffffff;
    }
    p {
      font-size: 15px;
      line-height: 1.6;
      color: #a0aec0;
      margin: 0 0 32px 0;
    }
    .btn {
      display: inline-block;
      background-color: ${accentColor};
      color: #ffffff !important;
      text-decoration: none;
      font-weight: bold;
      font-size: 15px;
      padding: 12px 32px;
      border-radius: 8px;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .btn:hover {
      transform: translateY(-1px);
      opacity: 0.95;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${emoji}</div>
    <h2>${title}</h2>
    <p>${message}</p>
    <a href="https://ts.armanayva.com" class="btn">Back to ThingSource</a>
  </div>
</body>
</html>`
    };
  };

  if (!token) {
    return htmlResponse(
      "Missing confirmation token",
      "We couldn't verify your subscription because the token is missing.",
      false
    );
  }

  try {
    const pendingStore = getStore({
      name: "pending_subscribers",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN,
    });

    const pendingDataStr = await pendingStore.get(token).catch(() => null);

    if (pendingDataStr) {
      const pending = JSON.parse(pendingDataStr);
      const email = pending.email;
      const key = "email:" + email.toLowerCase();

      const subscribersStore = getStore({
        name: "subscribers",
        siteID: process.env.NETLIFY_SITE_ID,
        token: process.env.NETLIFY_TOKEN,
      });

      // Save to confirmed store
      await subscribersStore.set(key, JSON.stringify({
        email: pending.email,
        token: token,
        subscribedAt: new Date().toISOString(),
        preferences: pending.preferences
      }));

      // Delete from pending
      await pendingStore.delete(token);

      // Send welcome email via Resend
      if (process.env.RESEND_API_KEY) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const siteUrl = "https://ts.armanayva.com";
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
  <p>Thank you for subscribing. You'll receive your customized daily origin stories, science snippets, and country facts in your inbox every morning.</p>
  <p>Visit the blog at <a href="${siteUrl}">${siteUrl}</a> to view the archive.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="font-size:12px;color:#999;">
    You received this email because you subscribed to ThingSource.<br>
    <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
  </p>
</body>
</html>`
          });
        } catch (emailErr) {
          console.error("Failed to send welcome email:", emailErr);
        }
      }

      return htmlResponse(
        "Subscription Confirmed!",
        "Thank you! You are now subscribed to ThingSource. You will start receiving your daily digests in your inbox."
      );
    }

    // If not found in pending, check if already active in confirmed subscribers
    const subscribersStore = getStore({
      name: "subscribers",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN,
    });
    const { blobs } = await subscribersStore.list();
    let alreadyConfirmed = false;

    for (const blob of blobs) {
      const dataStr = await subscribersStore.get(blob.key);
      if (dataStr) {
        try {
          const sub = JSON.parse(dataStr);
          if (sub.token === token) {
            alreadyConfirmed = true;
            break;
          }
        } catch (e) {}
      }
    }

    if (alreadyConfirmed) {
      return htmlResponse(
        "Subscription Confirmed!",
        "Your subscription is already confirmed and active. You are all set!"
      );
    }

    return htmlResponse(
      "Link Expired or Invalid",
      "This confirmation link is invalid or has expired. Please try subscribing again.",
      false
    );

  } catch (error) {
    console.error("Error in confirm-subscription function:", error);
    return htmlResponse(
      "An error occurred",
      "We encountered an issue confirming your subscription. Please try again later.",
      false
    );
  }
};
