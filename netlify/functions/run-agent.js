const { runAgent } = require("./agent-core.js");

exports.handler = async () => {
  try {
    const result = await runAgent();
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, title: result?.title }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
