# 💡 ThingSource

ThingSource is an autonomous, AI-driven history and trivia blog engine. It uses **Google Gemini 2.5 Flash** with **Google Search Grounding** (and a **Claude 3.5 Sonnet** fallback) to discover, research, write, and illustrate articles about the fascinating origins of everyday things.

The project is hosted completely serverless on **Netlify**, utilizing **Netlify Functions** for execution, **Netlify Blobs** for newsletter subscription management, and **GitHub API** for content commits.

---

## ✨ Features

- **Autonomous Research Agent**: Initiates deep historical research on everyday things (e.g., *potato chips, coffee, forks*) using Gemini Flash with Google Search Grounding.
- **Combined Single-Call AI Engine**: Fully optimized to run within serverless limits by combining topic selection, research, and blog compilation into one unified request.
- **Claude Fallback**: Automatically falls back to Anthropic's Claude if Gemini hits a rate limit (`429`), routing through a custom knowledge-base prompt when search grounding is unavailable.
- **Git-Backed Content Store**: Commits newly compiled blog posts (`posts.json`) directly back to the GitHub repository using the GitHub API (which automatically triggers a Netlify rebuild).
- **Netlify Blobs Database**: Stores and lists subscriber records in a serverless, database-free Netlify Blob store.
- **Split Email Notifications**: Delegates email broadcasts to a separate `send-emails` function via fire-and-forget execution to stay within maximum runtime limits.
- **Email Newsletter (Resend)**: Automated Substack-style broadcasting to your subscriber list, including a welcome email and instant unsubscribe links.

---

## 🛠️ Tech Stack

- **Hosting**: Netlify Serverless
- **AI Integrations**: `@google/genai` (Gemini 2.5 Flash) & Anthropic Claude (via fetch fallback)
- **Database**: Netlify Blobs (subscribers), GitHub-hosted JSON (posts)
- **Email Delivery**: Resend API
- **Frontend**: HTML5, CSS3, ES6 JavaScript (Lightweight, single-page routed blog list/detail views under `/blog`)

---

## 📂 Directory Structure

```text
├── netlify/
│   └── functions/
│       ├── agent-core.js     # Shared core runner (AI research, GitHub commit logic)
│       ├── agent.js          # Scheduled function (cron 7am UTC) invoking agent-core
│       ├── run-agent.js      # Manual HTTP trigger for testing the agent runner
│       ├── subscribe.js      # POST: validates emails & saves subscribers to Netlify Blobs
│       ├── unsubscribe.js    # GET: deletes subscriber matching token from Netlify Blobs
│       ├── send-emails.js    # POST: handles bulk email distribution via Resend
│       └── count.js          # GET: returns active subscriber count
├── public/
│   ├── blog/
│   │   ├── index.html        # Client-routed blog directory (listing & detail modes)
│   │   └── rss.xml           # RSS 2.0 feed updated at build time
│   ├── posts.json            # Content store populated by the agent commits
│   ├── sitemap.xml           # XML Sitemap generated at build time
│   ├── styles.css            # Blog styling
│   └── app.js                # Form submission and frontpage actions
├── build.js                  # Build-time node script to compile RSS and sitemaps
├── netlify.toml              # Netlify build configuration & function definitions
└── package.json              # Project dependencies and build scripts
```

---

## 🚀 Setup & Environment Variables

Configure these environment variables in your **Netlify Dashboard** (**Site Configuration → Environment Variables**):

| Variable | Description |
| :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API key (from Google AI Studio). |
| `ANTHROPIC_API_KEY` | *(Optional)* Anthropic API key used as a fallback if Gemini rate limits. |
| `GITHUB_REPO` | GitHub repository path in `owner/repo` format (e.g. `aivoarm/ThingSource`). |
| `GITHUB_TOKEN` | Fine-grained PAT with read/write contents permissions on your repository. |
| `GITHUB_BRANCH` | Branch to commit changes back to (e.g. `main`). |
| `NETLIFY_SITE_ID` | Netlify Site ID UUID (found under Site Configuration → General). |
| `NETLIFY_TOKEN` | Netlify Personal Access Token (found under User Settings → Applications). |
| `RESEND_API_KEY` | Resend API key for distributing emails. |
| `RESEND_FROM` | Verified sender email address (e.g. `ThingSource <hello@yourdomain.com>`). |
| `HEALTHCHECK_URL` | *(Optional)* Health check ping URL. |

---

## 📜 License

This project is licensed under the MIT License.
