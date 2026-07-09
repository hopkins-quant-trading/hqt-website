# Hopkins Quant Trading — Website

Static marketing/info site for HQT, deployed on [Vercel](https://vercel.com).

## Structure

```
/
├── index.html            # Landing page (who we are, track record, gallery)
├── about.html            # About / team (leadership incl. board emails, members, destinations)
├── competitions.html     # The HQT-hosted Hopkins Trading Competition
├── apply.html            # Apply landing page (status + FAQ)
├── apply-form.html       # Club membership application form (→ /apply-form)
├── register-form.html    # Hosted-competition registration form (→ /register-form)
├── support.js            # Shared client runtime (GENERATED — see note below)
├── assets/               # Images, logos, team photos, fonts
│   ├── fonts/
│   ├── gallery/
│   ├── logos/
│   └── team/
├── api/                  # Vercel serverless functions (the backend)
│   ├── apply.js          # Membership form POST → Airtable "Applications"
│   └── register.js       # Competition form POST → Airtable "Competition Registrations"
└── vercel.json           # Clean URLs + /coffee-chats → /apply redirect
```

The public pages are plain static HTML served directly from the repo root —
no build step. `support.js` is generated from a separate `dc-runtime`
source and should not be hand-edited.

## Why this structure (vs. a Flask app)

The site itself is purely informational, so static HTML is the right fit:
nothing to run, nothing to break, near-free hosting.

Once we start **receiving applications** we need a backend (to receive,
validate, and store form submissions). Rather than standing up a separate
Flask server, we use **Vercel serverless functions** in the `api/` folder:
- Same repo, same deploy — no second thing to host.
- The `api/` directory is auto-detected by Vercel; each file becomes an
  endpoint (`api/apply.js` → `POST /api/apply`).

## Applications backend

There are **two pipelines**, stored in one **Airtable** base — a
spreadsheet-style UI the exec board can sort, filter, and tag with no code.
The free tier holds 1,000 rows, so both pipelines fit comfortably.

| Pipeline | Form | Endpoint | Airtable table |
|---|---|---|---|
| Club membership | `/apply-form` | `POST /api/apply` | `Applications` |
| Hosted competition | `/register-form` | `POST /api/register` | `Competition Registrations` |

The code is done; it just needs credentials. **One-time setup (~3 min):**

1. Create an Airtable base with two tables:
   - **Applications** — fields: `Name`, `Email`, `Year`, `Major`,
     `Experience`, `Why`, `Submitted At`
   - **Competition Registrations** — fields: `Name`, `Email`, `School`,
     `Year`, `Experience`, `Submitted At`
   (make `Year` a single-select or plain text).
2. Create a personal access token at
   [airtable.com/create/tokens](https://airtable.com/create/tokens) with the
   `data.records:write` scope on that base.
3. In Vercel → Project → Settings → **Environment Variables**, set
   `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, and (optionally) `AIRTABLE_TABLE`.
   See `.env.example`. Redeploy.

Until those vars are set, both endpoints validate input and log the
submission (without saving) so the form still works during setup — it does
**not** silently lose data once configured.

**When applications open:** in `apply.html`, replace the disabled
"Application closed" pill with a link to `/apply-form`.

**Optional later:** email the board on each submission (Airtable automations
can do this with no code), or move to Postgres if you outgrow Airtable.

## Local development

```bash
npm i -g vercel   # once
vercel dev        # serves the static site + api/ functions locally
```

## Deploy

Pushing to the default branch auto-deploys via the connected Vercel project.
