const { schedule } = require("@netlify/functions");

const CRON = "30 7 * * *";

exports.handler = schedule(CRON, async () => {
  try {
    console.log("Scheduled science-agent trigger starting...");
    const siteUrl = process.env.URL || "https://thingsource.netlify.app";
    const url = `${siteUrl}/.netlify/functions/run-science-agent-background`;
    console.log(`Triggering background function at: ${url}`);
    
    await fetch(url, { method: "POST" });
    
    console.log("Background science-agent triggered successfully.");
    return { statusCode: 200 };
  } catch (error) {
    console.error("Failed to trigger scheduled science run:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
});
