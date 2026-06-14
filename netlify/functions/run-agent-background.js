const { runAgent } = require("./agent-core.js");

exports.handler = async () => {
  try {
    console.log("[Background Agent] Starting background run...");
    await runAgent();
    console.log("[Background Agent] Finished background run successfully.");
  } catch (err) {
    console.error("[Background Agent] Fatal error:", err);
  }
};
