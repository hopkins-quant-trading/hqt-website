# Hopkins Quant Trading — Website

Static marketing/info site for HQT, deployed on [Vercel](https://vercel.com).

## Structure

```
/
├── src/
│   ├── shell.html          # Outer page wrapper shared by every bundled page (see below)
│   ├── partials/
│   │   ├── nav.html        # Shared nav, injected into every bundled page
│   │   └── footer.html     # Shared footer, injected into every bundled page
│   ├── styles/
│   │   ├── main.css        # Shared design system for index/about/competitions/apply
│   │   └── forms.css       # Shared styles for the two standalone form pages
│   └── pages/
│       ├── index.html          # Landing page (who we are, track record, gallery)
│       ├── about.html          # About / team (leadership incl. board emails, members, destinations)
│       ├── competitions.html   # The HQT-hosted Hopkins Trading Competition
│       ├── apply.html          # Apply landing page (status + FAQ)
│       ├── apply-form.html     # Club membership application form (→ /apply-form)
│       └── register-form.html  # Hosted-competition registration form (→ /register-form)
├── scripts/build.js       # Builds src/ → dist/ (see "Build" below)
├── support.js             # Shared client runtime (GENERATED — see note below)
├── assets/                # Images, logos, team photos, fonts
│   ├── fonts/
│   ├── gallery/
│   ├── logos/
│   └── team/
├── api/                   # Vercel serverless functions (the backend)
│   ├── apply.js           # Membership form POST → Airtable "Applications"
│   └── register.js        # Competition form POST → Airtable "Competition Registrations"
└── vercel.json            # Build command/output dir, clean URLs, /coffee-chats → /apply redirect
```

`support.js` is generated from a separate `dc-runtime` source and should not
be hand-edited.

## Build

The four content pages (`index`, `about`, `competitions`, `apply`) render via
a small React/Babel-in-browser runtime (`support.js`) that expects a single
JSON-string-encoded template per page — that's what actually ships. Editing
that format by hand isn't practical (see
`docs/superpowers/specs/2026-08-13-source-cleanup-design.md` for why), so the
real source lives in `src/` as plain, readable HTML/CSS, and
`scripts/build.js` compiles it into that shipped format:

```bash
npm install
npm run build          # writes dist/ — this is what Vercel deploys
npx serve dist          # preview locally
```

`vercel.json` sets `buildCommand`/`outputDirectory` so Vercel runs this
automatically on every deploy. The two form pages (`apply-form.html`,
`register-form.html`) are already plain static HTML/CSS/JS — no bundling
needed — so the build just copies them through.

Run `npm run format` (Prettier) before committing changes under `src/`.

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

**When applications open:** in `src/pages/apply.html`, replace the disabled
"Application closed" pill with a link to `/apply-form`, then `npm run build`.

**Optional later:** email the board on each submission (Airtable automations
can do this with no code), or move to Postgres if you outgrow Airtable.

## Local development

```bash
npm i -g vercel   # once
vercel dev        # runs the build, then serves dist/ + api/ functions locally
```

## Deploy

Pushing to the default branch auto-deploys via the connected Vercel project.
