# Job Radar

A lightweight dashboard for reviewing senior SaaS job opportunities, comparing fit, hunter intensity, location, compensation and company sentiment, and preparing tailored applications.

## Current MVP

The current version is a static front-end prototype. It demonstrates the intended workflow and can be hosted immediately on GitHub Pages.

### What it shows

- Ranked job opportunities
- Fit score
- Hunter intensity
- Location and remote status
- Salary / OTE when known
- Company sentiment / rating placeholder
- Main pros and risks
- Application recommendation
- Suggested CV changes
- Cover-letter angle
- Application / follow-up states

## Owner IT/SaaS search (November 2026)

The owner account now has two separate discovery lanes:

- **Fresh ATS scan:** \`scanner/owner_ats.mjs\` reads public employer job-board APIs (Greenhouse and Ashby), not JobSpy. \`.github/workflows/scan-owner-ats.yml\` runs on weekdays and when the scanner is changed. It writes \`data/owner-ats-jobs.json\` with the current listed jobs, first-seen dates, source status, and new-since-last-scan count. A temporary API outage marks retained records "not rechecked" rather than claiming they are open.
- **Career Ops:** \`careerops/portals.yml\`, \`careerops/export.mjs\` and \`.github/workflows/scan-careerops.yml\` provide additional leads from company boards and Welcome to the Jungle. Its historical results are not independently guaranteed live.

Both feeds load into the **owner** Opportunities view, which deduplicates matching URLs and preserves the original job ID when available to retain local Yes/No decisions. The owner defaults to "Recently discovered". "Posting date" sorts only actual known posting dates; where absent, "Seen" is clearly labeled. The "New this week" and "EU/EMEA remote only" filters are optional.

Germany-based remote roles are *discoverable*, not presumed eligible for someone living in Estonia. Country-limited remote vacancies receive a lower score until authorized hiring countries and language requirements are verified.

On GitHub Pages, **Refresh listings** only reloads published JSON. To initiate a new ATS collection, use the **Run fresh IT/SaaS scan on GitHub** link (requires appropriate GitHub permissions). No token is embedded in the static website.

All owner-only configuration lives in the scanner, \`careerops/\` and owner defaults inside \`index.html\`. Clément's public directory entry and profile-specific JobSpy scanner remain unchanged.

Job Board APIs are public interfaces for employer-hosted vacancies, but public access does not imply unrestricted commercial redistribution. Check each source's terms before selling or republishing feed data at scale.

## Run locally

No build process is required.

Open `index.html` directly in your browser, or run a local static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Publish with GitHub Pages

1. Create a GitHub repository, for example `job-radar`.
2. Push this folder to the repository's `main` branch.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **GitHub Actions**.
5. Push to `main` again if necessary. The included workflow will publish the site.

The deployed URL will normally be:

`https://<github-username>.github.io/job-radar/`

## First push

```bash
git init
git add .
git commit -m "Initial Job Radar MVP"
git branch -M main
git remote add origin https://github.com/<username>/job-radar.git
git push -u origin main
```

## Planned production architecture

### Frontend

Move the static prototype to Next.js / React once the data layer is connected.

### Job ingestion

Use employer career pages and public ATS sources where possible:

- Greenhouse
- Ashby
- Lever
- Recruitee
- Workable
- Company career sites
- Manual job URL paste

Avoid brittle automated LinkedIn scraping.

### Database

Start with Supabase/Postgres for hosted persistence.

Suggested entities:

- `jobs`
- `companies`
- `applications`
- `cv_master`
- `cv_variants`
- `job_tailoring`
- `followups`

### Job scoring

Each job should be scored for:

- role fit
- seniority fit
- domain fit
- geography
- compensation
- hunter intensity
- pipeline support
- account-growth component
- company sentiment
- live vacancy confidence

### CV tailoring

Maintain one canonical CV plus a small number of base variants:

1. Strategic / Enterprise Account Management
2. Enterprise SaaS / Complex Solutions
3. Ecommerce / Retail / CX

For each job, generate only controlled changes:

- headline
- summary
- 1–3 bullet replacements
- emphasis / ordering
- cover letter
- application form answers

**Guardrail:** never invent experience, numbers, employers, achievements, technologies or responsibilities.

### Application workflow

Suggested stages:

`Saved → Review → Apply → Applied → Follow-up → Interview → Rejected / Offer / Closed`

Follow-up logic should surface applications that need a nudge after a configurable number of days.

## Security

Do not commit API keys or private CV data to a public repository.

Use environment variables and GitHub repository secrets for hosted integrations. `.env` files are ignored by default.

## Current status

GitHub-ready static MVP. Backend ingestion, persistence and AI tailoring are the next implementation phase.
