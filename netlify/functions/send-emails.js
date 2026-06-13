const { getStore } = require("@netlify/blobs");
const { Resend } = require("resend");

exports.handler = async (event) => {
  const log = (msg) => console.log(`[send-emails] ${msg}`);

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    let postData;
    try {
      postData = JSON.parse(event.body || "{}");
    } catch (err) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }

    if (!postData.title || !postData.id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required post fields (title, id)" }),
      };
    }

    log(`Fetching subscribers from Netlify Blobs for post: "${postData.title}"`);
    const store = getStore({
      name: "subscribers",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN,
    });
    const { blobs } = await store.list();
    log(`Subscribers found: ${blobs.length}`);

    if (blobs.length === 0) {
      log("No subscribers found. Skipping email sending.");
      return { statusCode: 200, body: JSON.stringify({ message: "No subscribers" }) };
    }

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
            if (!subscriberData.email) return;

            log(`Sending email to ${subscriberData.email}`);
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

            // 8 second timeout per email
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Resend timeout")), 8000)
            );

            await Promise.race([sendPromise, timeoutPromise]);
          } catch (err) {
            log(`Failed to send email to ${blob.key}: ${err.message}`);
          }
        })
      );
    }

    log(`Emailed ${blobs.length} subscribers.`);
    return { statusCode: 200, body: JSON.stringify({ message: "Emails sent successfully" }) };
  } catch (error) {
    log(`FATAL ERROR in send-emails function: ${error.message}`);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
