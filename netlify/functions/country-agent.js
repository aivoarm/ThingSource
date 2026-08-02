const { schedule } = require("@netlify/functions");

const CRON = "45 7 * * *"; // Run 15 minutes after science agent

exports.handler = schedule(CRON, async () => {
  try {
    console.log("Scheduled country-agent trigger starting...");
    const siteUrl = process.env.URL || "https://thingsource.netlify.app";
    const url = `${siteUrl}/.netlify/functions/run-country-agent-background`;
    console.log(`Triggering background function at: ${url}`);
    
    await fetch(url, { method: "POST" });
    
    console.log("Background country-agent triggered successfully.");
    return { statusCode: 200 };
  } catch (error) {
    console.error("Failed to trigger scheduled country run:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
});
