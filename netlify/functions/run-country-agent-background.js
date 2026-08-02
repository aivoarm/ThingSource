const { runCountryAgent } = require("./country-agent-core.js");

exports.handler = async () => {
  try {
    console.log("[Background Country Agent] Starting background run...");
    await runCountryAgent();
    console.log("[Background Country Agent] Finished background run successfully.");
  } catch (err) {
    console.error("[Background Country Agent] Fatal error:", err);
  }
};
