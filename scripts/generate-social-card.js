const puppeteer = require("puppeteer");
const path = require("path");

async function generateSocialCard() {
  console.log("Launching headless browser...");
  const browser = await puppeteer.launch({ 
    args: ["--no-sandbox", "--disable-setuid-sandbox"] 
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  
  const filePath = path.join(__dirname, "../public/social-card.html");
  await page.goto("file://" + filePath);
  
  // Wait for 1 second for webfonts to load
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log("Taking screenshot...");
  await page.screenshot({ 
    path: path.join(__dirname, "../public/social-card.png"),
    type: "png"
  });
  
  await browser.close();
  console.log("Social card generated: public/social-card.png");
}

generateSocialCard().catch(err => {
  console.error("Error generating social card:", err);
  process.exit(1);
});
