const { getStore } = require("@netlify/blobs");

exports.handler = async (event, context) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;

  if (!token) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html" },
      body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Unsubscribe Error</title></head>
<body style="font-family:sans-serif;text-align:center;padding:50px;">
  <h2>Missing unsubscribe token</h2>
  <p><a href="https://ts.armanayva.com">Back to ThingSource</a></p>
</body>
</html>`
    };
  }

  try {
    const store = getStore({
      name: "subscribers",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN,
    });
    const { blobs } = await store.list();
    let foundAndDeleted = false;

    for (const blob of blobs) {
      const dataStr = await store.get(blob.key);
      if (dataStr) {
        try {
          const subscriber = JSON.parse(dataStr);
          if (subscriber.token === token) {
            await store.delete(blob.key);
            foundAndDeleted = true;
            break;
          }
        } catch (e) {
          console.error("Error parsing subscriber blob:", e);
        }
      }
    }

    const message = foundAndDeleted
      ? "You've been unsubscribed. You won't receive any more emails."
      : "Link not found or already used.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Unsubscribe — ThingSource</title>
</head>
<body style="font-family:sans-serif;text-align:center;padding:50px;background:#070913;color:#fff;">
  <div style="max-width:500px;margin:0 auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);padding:30px;border-radius:12px;">
    <h2>${message}</h2>
    <p style="margin-top:20px;"><a href="https://ts.armanayva.com" style="color:#ef4444;text-decoration:none;font-weight:bold;">Back to ThingSource</a></p>
  </div>
</body>
</html>`
    };
  } catch (error) {
    console.error("Error unsubscribing:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Error</title></head>
<body style="font-family:sans-serif;text-align:center;padding:50px;background:#070913;color:#fff;">
  <h2>An error occurred. Please try again.</h2>
  <p><a href="https://ts.armanayva.com" style="color:#ef4444;">Back to ThingSource</a></p>
</body>
</html>`
    };
  }
};
