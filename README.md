# 💡 ThingSource

ThingSource is an autonomous, AI-driven history and trivia blog engine. It uses **Google Gemini 2.5 Flash** with **Google Search Grounding** to discover, research, write, and illustrate articles about the fascinating origins of everyday things.

It features a dark-themed local dashboard, remote CMS publishing via webhooks, and an email newsletter broadcasting system powered by **Resend**.

---

## ✨ Features

- **Autonomous Research Agent**: Initiates deep historical research on everyday things (e.g., *potato chips, coffee, forks*) using Gemini Flash with Google Search Grounding.
- **Catchy Content Generation**: Outputs full, structured articles, engaging summaries, fun facts, search keywords, and web citations.
- **Automated Image Sourcing**: Dynamically crawls Unsplash for high-quality, contextual stock photos matching the article's themes.
- **Premium Dark-Theme Console**: An interactive control center to:
  - Run the agent on-demand.
  - Queue up specific topics to research next.
  - Customize the cron scheduler.
  - Track live research logs in a simulated terminal environment.
- **Email Newsletter (Resend)**: Automated Substack-style broadcasting to a subscriber list, complete with:
  - **Dynamic SVG Banners**: Curated, responsive vector header graphics generated dynamically and base64-encoded directly into the email payload.
  - **CSS Fallbacks**: Built-in linear gradients to guarantee beautiful visual styling in clients (like Gmail) that strip SVGs.
  - **Instant Unsubscribe**: Fully integrated GET `/unsubscribe` endpoint and automated footer link insertion.
- **Remote CMS Sync (Webhook)**: Push generated posts automatically or manually to external sites (e.g. `blog.armanayva.com`) using structured JSON payloads.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **AI Integration**: `@google/genai` (Google Gemini 2.5 Flash SDK)
- **Scheduling**: `node-cron`
- **Email Delivery**: Resend API
- **Frontend**: Vanilla HTML5, CSS3, ES6 JavaScript (No frameworks, lightweight, fast, and fully responsive)

---

## 📂 Directory Structure

```text
├── agent.js              # Core AI research, Unsplash image crawler, and compilation script
├── server.js             # Express API server, scheduler, and Resend email broadcaster
├── package.json          # Dependency definition
├── .gitignore            # Git exclusion rules (safeguards secrets & databases)
├── .env.example          # Environment variables template
├── data/
│   ├── posts.json        # Local database storing generated blog posts
│   ├── subscribers.json  # Local database storing subscriber email addresses
│   └── agent_run.log     # Local log file updated in real-time by the agent
└── public/
    ├── index.html        # SPA dashboard and grid layout
    ├── styles.css        # Premium dark-mode dashboard styling
    ├── app.js            # Frontend logic (polling, routing, subscriber submissions)
    └── images/           # Downloaded article cover images
```

---

## 🚀 Installation & Setup

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/aivoarm/ThingSource.git
cd ThingSource
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to a new `.env` file:
```bash
cp .env.example .env
```
Fill in the variables inside `.env`:
```ini
# Google Gemini API Key - Get one from Google AI Studio: https://aistudio.google.com/
GEMINI_API_KEY=AIzaSy...

# Port to run the local Express web server
PORT=3000

# Resend API Key for Email Newsletter (optional)
RE_API=re_...

# Resend Sender Email (optional, defaults to onboarding@resend.dev)
SENDER_EMAIL=newsletter@yourdomain.com
```

### 3. Start the Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your web browser to access the dashboard and blog.

---

## 📨 Newsletter & Domain Verification (Resend)

By default, the application is pre-configured to use Resend's default sandbox address `onboarding@resend.dev`. 

> [!IMPORTANT]
> **Resend Sandbox Limitation**: When using `onboarding@resend.dev` as the sender, Resend only allows email delivery to the **address registered with your Resend developer account**. Attempts to send to third-party subscribers will fail.

**To transition to production sending:**
1. Navigate to the **Domains** section in your **Resend Dashboard**.
2. Add your custom domain (e.g. `armanayva.com` or `blog.armanayva.com`) and add the required DNS records (SPF, DKIM, DMARC) at your domain registrar.
3. Update the **Resend Sender Email** to `newsletter@yourdomain.com` in your `.env` file or in the **Agent Settings** panel in the dashboard.

---

## ☁️ Remote Publishing (Webhooks)

If you wish to host your public blog on an external platform, configure the **Remote Webhook URL** and **Auth Token** in the **Agent Settings** tab. 

When the agent successfully writes a post, it will execute a POST request to that endpoint with a JSON body representing the post structure. You can also manually trigger pushes for existing posts by clicking the cloud `☁️` icon on cards.

---

## 📜 License

This project is licensed under the MIT License.
