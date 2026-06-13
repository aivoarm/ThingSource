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
    const firstSectionPreview = firstSection ? firstSection.content.substring(0, 300) + "..." : "";

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
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1C1C1E">
  <h1 style="font-family: Georgia, serif; font-size: 24px; color: #1C1C1E; margin-bottom: 10px;">${postData.title}</h1>
  <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; color: #1C1C1E; font-style: italic; margin-bottom: 20px;">${postData.summary}</p>
  
  <p style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1C1C1E;">${firstSectionPreview}</p>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FFFFFF; border-left: 4px solid #0D7A6B; margin: 25px 0; border-radius: 0 4px 4px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
    <tr>
      <td style="padding: 20px;">
        <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; text-transform: uppercase; color: #0D7A6B; font-weight: bold; margin: 0 0 6px 0; letter-spacing: 1px;">
          From The Creator
        </p>
        <h3 style="font-family: Georgia, serif; font-size: 18px; font-weight: bold; margin: 0 0 6px 0; color: #1C1C1E;">
          Tune into my music projects
        </h3>
        <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1C1C1E; margin: 0 0 16px 0;">
          When I'm not configuring automation pipelines, I make music. Stream my official tracks and personal curated collections over on Spotify.
        </p>
        <div>
          <a href="https://open.spotify.com/artist/1DukxxMpzFcNZx5iIJiSK4" target="_blank" style="background-color: #0D7A6B; color: #F8F6F1; display: inline-block; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: bold; line-height: 38px; text-align: center; text-decoration: none; width: 180px; -webkit-text-size-adjust: none; mso-hide: all; border-radius: 4px;">Listen on Spotify →</a>
        </div>
      </td>
    </tr>
  </table>

  <div style="margin:24px 0;">
    <a href="${postUrl}" style="background:#0D7A6B;color:#F8F6F1;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-family:'Helvetica Neue', Arial, sans-serif;font-weight:bold;">Read full post</a>
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
