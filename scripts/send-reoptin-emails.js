require('dotenv').config();
const { getStore } = require("@netlify/blobs");
const { Resend } = require("resend");
const crypto = require("crypto");

const dryRun = process.env.DRY_RUN !== "false";

async function main() {
  console.log(`=== ThingSource Re-Opt-In Migration Script ===`);
  console.log(`Dry Run Mode: ${dryRun ? "ENABLED (set DRY_RUN=false to run for real)" : "DISABLED (WARNING: This will modify blobs and send real emails!)"}\n`);

  if (!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_TOKEN) {
    console.error("Error: Missing Netlify configuration (NETLIFY_SITE_ID or NETLIFY_TOKEN)");
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("Error: Missing RESEND_API_KEY");
    process.exit(1);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const subscribersStore = getStore({
    name: "subscribers",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  });

  const pendingStore = getStore({
    name: "pending_subscribers",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  });

  console.log("Listing subscribers from active store...");
  const { blobs } = await subscribersStore.list();
  console.log(`Found ${blobs.length} subscribers in total.\n`);

  if (blobs.length === 0) {
    console.log("No subscribers found to migrate.");
    return;
  }

  for (const blob of blobs) {
    try {
      const raw = await subscribersStore.get(blob.key);
      if (!raw) {
        console.warn(`Empty data for key: ${blob.key}`);
        continue;
      }

      const subscriber = JSON.parse(raw);
      const email = subscriber.email;
      if (!email) {
        console.warn(`Skipping invalid subscriber record with no email at key: ${blob.key}`);
        continue;
      }

      const targets = ["aayvazy@gmail.com", "hello@resillion.com"];
      if (!targets.includes(email.toLowerCase().trim())) {
        console.log(`Skipping: ${email} (not in targeted migration list)`);
        console.log("---");
        continue;
      }

      const token = subscriber.token || crypto.randomBytes(32).toString("hex");
      const preferences = subscriber.preferences || { thingsource: true, science: true, countries: [] };

      console.log(`Processing: ${email}`);
      console.log(`  Token: ${token}`);
      console.log(`  Preferences: ${JSON.stringify(preferences)}`);

      if (dryRun) {
        console.log(`  [DRY RUN] Would save to pending_subscribers under key "${token}"`);
        console.log(`  [DRY RUN] Would delete active subscriber key "${blob.key}"`);
        console.log(`  [DRY RUN] Would send re-opt-in email to ${email}`);
      } else {
        // 1. Save to pending_subscribers
        await pendingStore.set(token, JSON.stringify({
          email,
          preferences,
          createdAt: new Date().toISOString(),
          migratedFromActive: true
        }));

        // 2. Delete from subscribers active list
        await subscribersStore.delete(blob.key);

        // 3. Send re-opt-in email
        const siteUrl = "https://ts.armanayva.com";
        const confirmUrl = `${siteUrl}/.netlify/functions/confirm-subscription?token=${token}`;

        await resend.emails.send({
          from: process.env.RESEND_FROM || "ThingSource <thingsource@ts.armanayva.com>",
          to: email,
          subject: "Keep receiving your daily ThingSource digests",
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
    <p>Hi there,</p>
    <p>We are upgrading our subscription system at ThingSource to improve security and ensure email delivery quality.</p>
    <p>To keep receiving your customized daily origin stories, science snippets, and country facts in your inbox, please take a quick moment to confirm your email by clicking the button below:</p>
    <div class="btn-container">
      <a href="${confirmUrl}" class="btn">Keep Me Subscribed</a>
    </div>
    <p style="font-size: 13px; color: #666;">If the button doesn't work, copy and paste this URL into your browser:</p>
    <p style="font-size: 13px; color: #0d7a6b; word-break: break-all;"><a href="${confirmUrl}" style="color: #0d7a6b;">${confirmUrl}</a></p>
    <div class="footer">
      If you no longer wish to receive any emails from ThingSource, you don't need to do anything. Your email will be removed automatically if not confirmed.
    </div>
  </div>
</body>
</html>`
        });

        console.log(`  [SUCCESS] Migrated and emailed: ${email}`);
      }
    } catch (err) {
      console.error(`  [ERROR] Failed to process subscriber ${blob.key}:`, err.message);
    }
    console.log("---");
  }

  console.log("\nMigration script complete.");
}

main().catch(err => {
  console.error("Fatal error running migration:", err);
});
