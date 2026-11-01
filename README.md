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
