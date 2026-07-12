const { runScienceAgent } = require("./science-agent-core.js");

exports.handler = async () => {
  try {
    console.log("[Background Science Agent] Starting background run...");
    await runScienceAgent();
    console.log("[Background Science Agent] Finished background run successfully.");
  } catch (err) {
    console.error("[Background Science Agent] Fatal error:", err);
  }
};
