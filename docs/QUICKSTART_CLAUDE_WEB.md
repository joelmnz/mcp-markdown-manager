# Quick Start: Deploy to Claude Web in 15 Minutes

The fastest way to get your MCP Markdown Manager connected to Claude web.

## Prerequisites

- Claude Pro/Team/Enterprise account
- GitHub account (for Railway)
- 15 minutes

## Step 1: Deploy to Railway (5 minutes)

1. **Fork this repository** on GitHub

2. **Go to [Railway.app](https://railway.app)** and sign up with GitHub

3. **Create new project** → "Deploy from GitHub repo" → Select your fork

4. **Add PostgreSQL**
   - Click "New" → "Database" → "PostgreSQL"
   - Railway auto-configures `DATABASE_URL`

5. **Set environment variables** in Railway dashboard:

   Click your service → "Variables" → "Raw Editor" and paste:

   ```bash
   AUTH_TOKEN=change-this-to-something-secure
   OAUTH_ENABLED=true
   OAUTH_JWT_SECRET=your-jwt-secret-here-use-openssl-rand-hex-32
   OAUTH_ISSUER=https://${{RAILWAY_PUBLIC_DOMAIN}}
   MCP_SERVER_ENABLED=true
   NODE_ENV=production

   # Database (auto-configured)
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   DB_HOST=${{Postgres.PGHOST}}
   DB_PORT=${{Postgres.PGPORT}}
   DB_NAME=${{Postgres.PGDATABASE}}
   DB_USER=${{Postgres.PGUSER}}
   DB_PASSWORD=${{Postgres.PGPASSWORD}}
   ```

   **Generate a secure JWT secret:**
   ```bash
   # Run this locally and copy the output
   openssl rand -hex 32
   ```

6. **Deploy** - Railway auto-deploys from your GitHub repo

7. **Get your URL** - Railway shows your public URL (e.g., `https://your-app.railway.app`)

## Step 2: Initialize Database (2 minutes)

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Link to your project:**
   ```bash
   railway login
   railway link
   ```

3. **Initialize database:**
   ```bash
   railway run bun scripts/database.ts init
   ```

   You should see:
   ```
   ✅ Database initialized successfully
   ✅ OAuth tables created/verified
   ```

## Step 3: Connect to Claude Web (5 minutes)

1. **Open [Claude.ai](https://claude.ai)** and log in

2. **Go to Settings** → **Integrations**

3. **Click "Add custom connector"**

4. **Enter your MCP server URL:**
   ```
   https://your-app.railway.app/mcp
   ```
   (Replace with your actual Railway URL)

5. **Click "Connect"**
   - Claude will auto-register via OAuth
   - You'll see the consent page

6. **Click "Authorize"** on the consent screen

7. **Done!** You should see "Connected" status

## Step 4: Test It (3 minutes)

Start a new conversation in Claude and try:

```
Can you list my articles?
```

Claude should use the `listArticles` tool and show your articles (if any).

Try creating an article:

```
Create an article called "My First Article" with some welcome text.
```

Claude will use the `createArticle` tool and confirm creation.

## Troubleshooting

**"Unable to connect"**
- Check Railway logs for errors
- Verify URL ends with `/mcp`
- Make sure HTTPS (not HTTP)

**"Authorization failed"**
- Regenerate `OAUTH_JWT_SECRET` with: `openssl rand -hex 32`
- Verify `OAUTH_ISSUER` matches Railway public domain
- Re-deploy after changing env vars

**"Database error"**
- Run `railway run bun scripts/database.ts health`
- Check PostgreSQL is running in Railway dashboard

## What's Next?

- **Import articles:** Use the web UI at `https://your-app.railway.app`
- **Enable semantic search:** Set `SEMANTIC_SEARCH_ENABLED=true`
- **Customize:** Edit OAuth consent page branding
- **Monitor:** Check Railway logs and metrics

## Full Documentation

For detailed setup, troubleshooting, and advanced configuration, see:
- [Complete Deployment Guide](./CLAUDE_WEB_DEPLOYMENT.md)
- [OAuth Implementation Details](../OAUTH_IMPLEMENTATION.md)

---

**That's it!** You now have a working MCP server connected to Claude web. 🎉
