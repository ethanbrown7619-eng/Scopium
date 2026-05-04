# Deploying Scopium with zero local setup

You don't need to install anything on your computer — every command runs in
**GitHub Actions** in the cloud. You'll only click around in browser tabs
and paste a few values.

Total time: ~20 minutes.

## What you'll need

Four browser tabs:

1. **Cloudflare** — https://dash.cloudflare.com (sign up if needed)
2. **Supabase** — https://supabase.com (sign up if needed)
3. **Anthropic Console** — https://console.anthropic.com
4. **GitHub repo** — your fork of Scopium

## Step 1 — Spin up the database (Supabase)

1. Supabase dashboard → **New project**.
2. Region: **Southeast Asia (Sydney)** (closest to NZ).
3. Set a database password (Supabase generates a strong one — save it).
4. Click **Create**, wait ~1 minute.
5. Once it's up: left sidebar → **SQL Editor** → **New query** → paste:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
   Click **Run**.
6. Left sidebar → **Project Settings → Database → Connection string**.
7. Switch the dropdown to **Session pooler**.
8. Copy that URL. Replace `[YOUR-PASSWORD]` with the password from step 3.

   Final form looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxx:YOUR_PASSWORD@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres
   ```

   Keep this in a notepad — you'll paste it into GitHub in step 4.

## Step 2 — Get an AI API key (your choice of provider)

Scopium's Cmd-K Ask palette works with **Anthropic, OpenAI, or Google**.
Pick one — you only need one key.

| Provider | Where to get a key | Default model |
|---|---|---|
| **Anthropic** (Claude) | https://console.anthropic.com → API Keys → Create | `claude-sonnet-4-6` |
| **OpenAI** (ChatGPT) | https://platform.openai.com/api-keys → Create new secret key | `gpt-4o` |
| **Google** (Gemini) | https://aistudio.google.com/apikey → Create API key | `gemini-2.5-pro` |

Copy the key. Notepad it. Make sure the account has credits / billing set up.

## Step 3 — Get a Cloudflare API token + account ID

### Account ID
1. Cloudflare dashboard home page.
2. Right sidebar shows **Account ID**. Copy it. Notepad it.

### API token
1. https://dash.cloudflare.com/profile/api-tokens → **Create Token**.
2. Use the **Edit Cloudflare Workers** template → **Use template**.
3. (Optional) Restrict to your account.
4. **Create Token** → copy the value. Notepad it. (You won't see it again.)

## Step 4 — Add four secrets to GitHub

In your Scopium repo on GitHub:

1. **Settings → Secrets and variables → Actions**.
2. Under the **Secrets** tab → **New repository secret**, add:

   | Name | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | the API token from step 3 |
   | `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 3 |
   | `DATABASE_URL` | the Supabase pooler URL from step 1 |
   | `AI_API_KEY` | the AI key from step 2 |

3. Under the **Variables** tab → **New repository variable**, add:

   | Name | Value |
   |---|---|
   | `AI_PROVIDER` | `anthropic`, `openai`, or `google` (matches the key you chose) |
   | `AI_MODEL` | *(optional)* override the default model |

That's it for setup.

## Step 5 — Push the schema to Supabase

1. Repo → **Actions** tab.
2. Left sidebar → **Push DB Schema (Drizzle)**.
3. Top right → **Run workflow** → **Run workflow** (green button).
4. Wait ~1 minute. The dot turns green when it's done. If it fails, click
   the run to see what's wrong (usually a typo in `DATABASE_URL`).

## Step 6 — Seed companies

1. Actions tab → **Seed Companies**.
2. **Run workflow**. Inputs:
   - `limit`: how many companies to ingest. `200` is plenty for a demo;
     `5000` exercises the workspace at full scale.
   - `source`:
     - `synthetic` (default) — procedurally-generated NZ companies +
       directors. No third-party key needed. Same ontology shape as the
       real connector, so the workspace and Ask palette behave identically.
     - `api` — pulls from the real NZ Companies Register. Requires a
       Companies Office OAuth token added as the
       `NZ_COMPANIES_REGISTER_TOKEN` repo secret. Without one you'll get
       401s; stick to `synthetic` unless you've registered for access.
3. Click **Run workflow**. Wait for the green dot.

## Step 7 — Deploy to Cloudflare

You have two options:

- **Automatic**: just push any commit to the branch (or the GitHub UI's
  "Edit file" + commit). The `Deploy to Cloudflare Workers` workflow runs
  on every push.
- **Manual now**: Actions tab → **Deploy to Cloudflare Workers** →
  **Run workflow** → **Run workflow**.

Wait for the green dot (~3 minutes). The last step prints your Worker URL,
something like:

```
https://scopium.<your-account>.workers.dev
```

Open it. You should see the Scopium workspace with your seeded data.

## Step 8 (optional) — Custom domain

1. Cloudflare dashboard → **Workers & Pages → scopium → Settings → Domains
   & Routes → Add → Custom Domain**.
2. Pick a domain you own and have on Cloudflare. Or buy one in **Cloudflare
   Registrar** (wholesale, no markup) and add it here.

Done. The site is live, with Postgres in Sydney, Worker on Cloudflare's
global edge, and the AI Ask palette wired straight to Anthropic.

## Re-running things later

Everything is a workflow you re-run from the Actions tab:

| What changed | Re-run this workflow |
|---|---|
| Code (or the workflow auto-runs on push) | **Deploy to Cloudflare Workers** |
| Schema | **Push DB Schema (Drizzle)** |
| Want more seed data | **Seed NZ Companies Register** |
| Need to rotate AI key or switch provider | Update `AI_API_KEY` (and `AI_PROVIDER`) in repo settings, then re-run **Deploy** |

## Troubleshooting

- **Deploy fails with "script too large"**: the bundle exceeded 3 MB. Check
  the build output; the easiest fix is upgrading to Workers Paid ($5/mo).
- **`/api/query` returns 500**: usually `DATABASE_URL` typo, or you forgot
  step 5. Re-run the **Push DB Schema** workflow.
- **`/api/ask` returns 401**: AI key is wrong or for a different provider.
  Re-check `AI_PROVIDER` matches the key, then re-run **Deploy**.
- **Nothing in the workspace**: you skipped the seed. Run the **Seed**
  workflow.
- **Live logs**: Cloudflare dashboard → **Workers & Pages → scopium →
  Logs**. Real-time stream of every request.
