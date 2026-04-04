# Deploy: GitHub + Vercel (frontend) + API + Postgres

The **Next.js** app fits **Vercel**. The **Express + Socket.IO** API does **not** run on Vercel’s serverless model for long-lived WebSockets — host the backend on a **long‑running Node** service (Railway, Fly.io, Render, a VPS, etc.) with your production `DATABASE_URL`.

## 1. Create the GitHub repository

From the project root (after `git` is initialized and you’ve committed):

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USER/together.git
git push -u origin main
```

Or with [GitHub CLI](https://cli.github.com/) (`gh auth login` once):

```bash
gh repo create together --private --source=. --remote=origin --push
```

Use `--public` instead of `--private` if you want the repo public (then **never** commit real secrets — see `.gitignore`).

## 2. Managed PostgreSQL

Create a database (e.g. [Neon](https://neon.tech/), [Supabase](https://supabase.com/) Postgres, RDS). Copy the connection string as `DATABASE_URL` (SSL usually required; add `?sslmode=require` if the provider documents it).

Run migrations from your machine or CI (with the same URL):

```bash
cd backend
set DATABASE_URL=postgresql://...   # Windows PowerShell: $env:DATABASE_URL="..."
npx prisma migrate deploy
```

## 3. Deploy the backend (example: Railway / Render)

General steps:

1. New **Web Service** from this GitHub repo.
2. **Root directory**: `backend` (or run commands from repo root with `cd backend`).
3. **Build**: `npm install && npm run prisma:generate && npm run build`
4. **Start**: `npx prisma migrate deploy && npm start`  
   Or split: run migrate once manually, then start command `npm start` only.
5. **Environment variables** (minimum):

   | Variable | Example |
   |----------|---------|
   | `DATABASE_URL` | `postgresql://...` |
   | `JWT_SECRET` | long random string |
   | `PORT` | often set by host (e.g. `4000` or `$PORT`) |
   | `CORS_ORIGIN` | `https://your-app.vercel.app` (no trailing slash) |
   | `NODE_ENV` | `production` |

   Optional email (see main README): `NOTIFY_MOOD_EMAIL`, `SMTP_*`, `PUBLIC_WEB_URL`.

6. Copy the service **public HTTPS URL** (e.g. `https://your-api.railway.app`) — this is your API base.

**Health check**: `GET https://your-api.../health` should return `{"ok":true}`.

## 4. Deploy the frontend on Vercel

1. [Vercel](https://vercel.com/) → **Add New…** → **Project** → Import the **same** GitHub repo.
2. **Root Directory** → **Edit** → set to **`frontend`** (important for this monorepo).
3. Framework: Next.js (auto-detected).
4. **Environment Variables**:

   | Name | Value |
   |------|--------|
   | `NEXT_PUBLIC_API_URL` | `https://your-api...` (no trailing slash) |

5. Deploy.

6. Set **`CORS_ORIGIN`** on the backend to your exact Vercel URL (`https://<project>.vercel.app` or custom domain), redeploy API if needed.

## 5. Smoke test

1. Open the Vercel URL, register two users (two browsers / incognito).
2. Create room, join with code, set moods — realtime should work if WebSockets are allowed through your API host’s proxy.

## 6. iOS / Firebase

Unrelated to Vercel; see [`ios/README.md`](../ios/README.md). Do **not** commit `GoogleService-Info.plist` with secrets to a public repo.
