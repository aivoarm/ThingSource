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
  text += `♪ SPONSORED BY ARMAN AYVA\n\n`;
  text += `ThingSource is built and maintained by Arman Ayva,\n`;
  text += `a digital creator passionate about AI and automation.\n\n`;
  text += `Arman also makes original music on Spotify.\n`;
  text += `Every stream directly supports ThingSource and\n`;
  text += `keeps it free for everyone.\n\n`;
  text += `To say thank you: search "Arman Ayva" on Spotify\n`;
  text += `and give his music a listen. It costs you nothing.\n\n`;

  const postUrl = `https://thingsource.netlify.app/blog/?id=${post.id}`;
  text += `---\n`;
  text += `SHARE THIS STORY\n`;
  text += `Share on X: https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title + ' — via @ThingSource')}&url=${encodeURIComponent(postUrl)}\n`;
  text += `Share on LinkedIn: https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(postUrl)}\n\n`;

  text += `---\n`;
  text += `You received this because you subscribed to ThingSource.\n`;
  text += `To unsubscribe: ${unsubUrl}\n`;
  text += `© 2026 ThingSource\n`;
  return text;
}

// ─── HTML builder ─────────────────────────────────────────────────────────
function buildEmailHtml(post, unsubUrl) {
  // Render all sections in full
  const sectionsHtml = (post.sections || []).map((section, idx) => {
    // Strip basic markdown bold/italic for email safety
    const content = section.content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");
    return `
  <h2 style="font-family:Georgia,serif;font-size:18px;color:#1C1C1E;margin:28px 0 8px;line-height:1.3">${section.heading}</h2>
  <p style="font-size:14px;line-height:1.75;color:#333;margin:0 0 16px">${content}</p>`;
  }).join("");

  // Fun facts block (if present)
  const funFactsHtml = post.funFacts?.length
    ? `<div style="background:#FFF8EC;border-left:4px solid #F5A623;padding:14px 18px;margin:24px 0;border-radius:0 6px 6px 0">
    <p style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;color:#F5A623;margin:0 0 8px">Did You Know?</p>
    <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:#333">
      ${post.funFacts.map(f => `<li>${f}</li>`).join("")}
    </ul>
  </div>`
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

  <!-- All sections in full -->
  ${sectionsHtml}

  <!-- Fun facts -->
  ${funFactsHtml}

  <!-- Sponsor block — Spotify music promotion -->
  <div style="background:#F8F6F1;border-radius:8px;padding:20px 24px;margin:32px 0;border-left:4px solid #0D7A6B">
    <p style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px;font-family:Arial,sans-serif">♪ Sponsored by</p>
    <p style="font-size:18px;font-weight:bold;color:#1C1C1E;margin:0 0 8px;font-family:Georgia,serif">Arman Ayva</p>
    <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 12px;font-family:Arial,sans-serif">
      ThingSource is created and maintained by <strong>Arman Ayva</strong> — a digital creator, educator, and technology enthusiast who builds AI-powered tools and automated systems.
    </p>
    <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 16px;font-family:Arial,sans-serif">
      Arman also creates and releases original music on Spotify. Every stream directly supports the cost of running ThingSource and keeps it free for all readers. If you enjoy these daily stories, the best way to say thank you is to search <strong>&ldquo;Arman Ayva&rdquo;</strong> on Spotify and give his music a listen.
    </p>
    <div style="background:#1DB954;border-radius:6px;display:inline-block;padding:2px 12px 4px">
      <p style="font-size:13px;color:white;font-weight:bold;margin:0;font-family:Arial,sans-serif">▶ Search &ldquo;Arman Ayva&rdquo; on Spotify</p>
    </div>
    <p style="font-size:12px;color:#999;margin:12px 0 0;font-family:Arial,sans-serif">Your streams cost nothing and mean everything. Thank you for supporting independent creators.</p>
  </div>

  <!-- Share block -->
  <div style="margin:28px 0;padding:18px 20px;border:1px solid #eee;border-radius:8px;text-align:center">
    <p style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 14px;font-weight:bold">Enjoyed this? Share it</p>
    <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto">
      <tr>
        <td style="padding:0 6px">
          <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title + ' — via @ThingSource')}&url=${encodeURIComponent('https://thingsource.netlify.app/blog/?id=' + post.id)}"
             style="display:inline-block;background:#000;color:#fff;font-size:12px;font-weight:bold;padding:8px 16px;border-radius:4px;text-decoration:none;font-family:'Helvetica Neue',Arial,sans-serif">
            𝕏 Share
          </a>
        </td>
        <td style="padding:0 6px">
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://thingsource.netlify.app/blog/?id=' + post.id)}"
             style="display:inline-block;background:#0A66C2;color:#fff;font-size:12px;font-weight:bold;padding:8px 16px;border-radius:4px;text-decoration:none;font-family:'Helvetica Neue',Arial,sans-serif">
            in LinkedIn
          </a>
        </td>
        <td style="padding:0 6px">
          <a href="https://wa.me/?text=${encodeURIComponent(post.title + ' — ' + 'https://thingsource.netlify.app/blog/?id=' + post.id)}"
             style="display:inline-block;background:#25D366;color:#fff;font-size:12px;font-weight:bold;padding:8px 16px;border-radius:4px;text-decoration:none;font-family:'Helvetica Neue',Arial,sans-serif">
            WhatsApp
          </a>
        </td>
      </tr>
    </table>
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
              from: process.env.RESEND_FROM || "ThingSource <thingsource@ts.armanayva.com>",
              replyTo: process.env.RESEND_FROM || "thingsource@ts.armanayva.com",
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
