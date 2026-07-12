require('dotenv').config();
const { Resend } = require("resend");
const fs = require('fs');
const path = require('path');

// Mock buildPlainTextEmail and buildEmailHtml for testing by importing them
const sendEmailsFunc = require("./netlify/functions/send-emails.js");

// We need to inspect buildEmailHtml from the file. Let's extract it or copy it for local testing.
// Alternatively, since send-emails.js doesn't export them directly, we can read them from send-emails.js or export them.
// Let's look at netlify/functions/send-emails.js. It only exports `exports.handler`.
// To test it easily, let's copy the builder functions here or call the handler with a mock event!
// The handler takes `event` and sends emails to subscribers from Netlify Blobs.
// But we want to send to a test email, not the actual subscribers list.
// So let's write a small script that directly imports resend and sends a mock template using the functions defined in send-emails.js.
// Since they are not exported, let's read send-emails.js file content, eval or parse the functions, or we can just modify send-emails.js to export them, or write our own test version of buildEmailHtml.
// Let's modify netlify/functions/send-emails.js to export the helper functions so they are testable!
// Wait, that is an excellent practice. Let's make netlify/functions/send-emails.js export buildEmailHtml and buildPlainTextEmail at the end of the file.

const posts = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/posts.json'), 'utf8'));
const testPost = posts[0];

const resend = new Resend(process.env.RESEND_API_KEY);

// We will test both the html and plain text templates.
const unsubUrl = "https://ts.armanayva.com/unsubscribe?token=testtoken";

// Let's run a test call. We'll load the functions dynamically after modifying send-emails.js.
const { buildEmailHtml, buildPlainTextEmail } = require("./netlify/functions/send-emails.js");

let scienceArticles = [];
try {
  const sciencePostsPath = path.join(__dirname, 'public/science-posts.json');
  if (fs.existsSync(sciencePostsPath)) {
    scienceArticles = JSON.parse(fs.readFileSync(sciencePostsPath, 'utf8')).slice(0, 3);
  }
} catch (err) {
  console.error("Failed to read science-posts for test email:", err.message);
}

const htmlContent = buildEmailHtml(testPost, unsubUrl, scienceArticles);
const textContent = buildPlainTextEmail(testPost, unsubUrl, scienceArticles);

console.log("Generated Email HTML Length:", htmlContent.length);
console.log("Sending test email to aayvazy@gmail.com...");

resend.emails.send({
  from: process.env.RESEND_FROM || "ThingSource <thingsource@ts.armanayva.com>",
  to: "aayvazy@gmail.com",
  subject: `[TEST] ${testPost.title} · ThingSource`,
  html: htmlContent,
  text: textContent
}).then(response => {
  console.log("Email sent successfully!", response);
}).catch(err => {
  console.error("Failed to send email:", err);
});
