require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

const apiKey = process.env.TWITTER_API_KEY;
const apiSecret = process.env.TWITTER_API_SECRET;
const accessToken = process.env.TWITTER_ACCESS_TOKEN;
const accessSecret = process.env.TWITTER_ACCESS_SECRET;

console.log("Checking Twitter credentials in .env...");
console.log("TWITTER_API_KEY:", apiKey ? `Configured (${apiKey.substring(0, 5)}...)` : "Missing");
console.log("TWITTER_API_SECRET:", apiSecret ? (apiSecret.startsWith("your_") ? "Placeholder" : "Configured") : "Missing");
console.log("TWITTER_ACCESS_TOKEN:", accessToken ? (accessToken.startsWith("your_") ? "Placeholder" : "Configured") : "Missing");
console.log("TWITTER_ACCESS_SECRET:", accessSecret ? (accessSecret.startsWith("your_") ? "Placeholder" : "Configured") : "Missing");

if (!apiKey || !apiSecret || !accessToken || !accessSecret || 
    apiKey.startsWith('your_') || apiSecret.startsWith('your_') || 
    accessToken.startsWith('your_') || accessSecret.startsWith('your_')) {
  console.error("\nError: Please replace the placeholder credentials in your .env file with real keys before testing.");
  process.exit(1);
}

const postsPath = path.join(__dirname, 'public/posts.json');
let testPost = {
  title: "Test Discovery Title",
  summary: "This is a test summary for verifying the new automated Twitter/X integration.",
  id: "test-id",
  slug: "test-discovery-title"
};

try {
  if (fs.existsSync(postsPath)) {
    const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
    if (posts && posts.length > 0) {
      testPost = posts[0];
    }
  }
} catch (e) {
  console.log("Could not load public/posts.json, using fallback mock post.");
}

const client = new TwitterApi({
  appKey: apiKey,
  appSecret: apiSecret,
  accessToken: accessToken,
  accessSecret: accessSecret,
});

const postUrl = `https://ts.armanayva.com/blog/${testPost.slug || testPost.id}`;
const headline = `New Origin Story: ${testPost.title}\n\n`;
const cta = `\n\nRead more: ${postUrl}`;
const maxSummaryLength = 280 - 23 - 13 - headline.length - 5; 

let summaryText = testPost.summary || '';
if (summaryText.length > maxSummaryLength) {
  summaryText = summaryText.substring(0, maxSummaryLength - 3) + "...";
}

const tweetText = `${headline}${summaryText}${cta}`;

console.log("\nConstructed Tweet Text:");
console.log("-----------------------------------------");
console.log(tweetText);
console.log("-----------------------------------------");
console.log(`Length: ${tweetText.length} characters.`);

console.log("\nAttempting to publish tweet...");
client.v2.tweet(tweetText)
  .then(response => {
    console.log("\nSuccess! Tweet published successfully.");
    console.log("Tweet ID:", response.data.id);
    console.log("Tweet Text:", response.data.text);
  })
  .catch(err => {
    console.error("\nError publishing tweet details:", err.message);
    if (err.data) {
      console.error("API error response details:", JSON.stringify(err.data, null, 2));
    }
  });
