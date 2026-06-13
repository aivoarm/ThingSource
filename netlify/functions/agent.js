const { schedule } = require("@netlify/functions");
const { runAgent } = require("./agent-core.js");

const CRON = "0 7 * * *";

exports.handler = schedule(CRON, async () => {
  try {
    await runAgent();
    return { statusCode: 200 };
  } catch (error) {
    console.error("Agent execution failed:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
});
