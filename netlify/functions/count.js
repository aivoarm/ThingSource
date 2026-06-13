const { getStore } = require("@netlify/blobs");

exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
    "Content-Type": "application/json"
  };

  try {
    const store = getStore("subscribers");
    const { blobs } = await store.list();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ count: blobs.length })
    };
  } catch (error) {
    console.error("Error in count function:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
