const { getStore } = require("@netlify/blobs");
const { Resend } = require("resend");

// ─── Plain-text builder ────────────────────────────────────────────────────
function buildPlainTextEmail(post, unsubUrl) {
  let text = "";
  text += `THINGSOURCE — CURIOUS ORIGINS DAILY\n\n`;
  text += `${post.title}\n`;
  text += `${"=".repeat(post.title.length)}\n\n`;
  text += `${post.summary}\n\n`;

  for (const section of post.sections || []) {
    text += `${section.heading}\n`;
    text += `${"-".repeat(section.heading.length)}\n`;
    const plain = section.content
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1");
    text += `${plain}\n\n`;
  }

  if (post.funFacts?.length) {
    text += `DID YOU KNOW?\n-------------\n`;
    post.funFacts.forEach((f) => (text += `• ${f}\n`));
    text += "\n";
  }

  text += `---\n`;
  text += `SPONSORED BY\n`;
  text += `Arman Ayva — Digital creator and technology `;
  text += `enthusiast passionate about AI and automation.\n`;
  text += `Search "Arman Ayva" to explore his work.\n\n`;
  text += `---\n`;
  text += `You received this because you subscribed to ThingSource.\n`;
  text += `To unsubscribe: ${unsubUrl}\n`;
  text += `© 2026 ThingSource\n`;
  return text;
}

// ─── HTML builder ─────────────────────────────────────────────────────────
function buildEmailHtml(post, unsubUrl) {
  const firstSection = post.sections?.[0];
  const firstSectionPreview = firstSection
    ? firstSection.content.substring(0, 300) + "…"
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1C1C1E;background:#ffffff">

  <!-- Header — plain text, no link -->
  <p style="font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#0D7A6B;margin:0 0 4px">ThingSource</p>
  <p style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 24px">Curious Origins Daily</p>

  <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px">

  <!-- Post title & summary -->
  <h1 style="font-family:Georgia,serif;font-size:24px;color:#1C1C1E;margin:0 0 10px;line-height:1.3">${post.title}</h1>
  <p style="font-size:15px;color:#444;font-style:italic;margin:0 0 20px;line-height:1.6">${post.summary}</p>

  <!-- First section preview -->
  <p style="font-size:14px;line-height:1.7;color:#1C1C1E;margin:0 0 24px">${firstSectionPreview}</p>

  <!-- Sponsor block — plain text only, no links -->
  <div style="background:#F8F6F1;border-radius:8px;padding:16px 20px;margin:24px 0">
    <p style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">Sponsored by</p>
    <p style="font-size:16px;font-weight:bold;color:#1C1C1E;margin:0 0 6px">Arman Ayva</p>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0">
      Digital creator and technology enthusiast passionate about AI, automation, and building innovative tools.
      Search &ldquo;Arman Ayva&rdquo; to explore his work.
    </p>
  </div>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0">

  <!-- Footer — unsubscribe is the ONLY link -->
  <p style="font-size:12px;color:#999;line-height:1.6;margin:0">
    You received this email because you subscribed to ThingSource.<br>
    <a href="${unsubUrl}" style="color:#999">Unsubscribe</a>
  </p>

</body>
</html>`;
}

// ─── Handler ───────────────────────────────────────────────────────────────
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
              from: process.env.RESEND_FROM || "ThingSource <thingsource@resend.dev>",
              replyTo: "thingsource@resend.dev",
              to: subscriberData.email,
              subject: `${postData.title} · ThingSource`,
              html: buildEmailHtml(postData, unsubUrl),
              text: buildPlainTextEmail(postData, unsubUrl),
              // No tracking options — clean send
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
