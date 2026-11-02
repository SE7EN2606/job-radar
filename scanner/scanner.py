from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from jobspy import scrape_jobs

OUT = Path("data/jobs.json")
STATE = Path("data/user-state.json")

SEARCHES = [
    "Enterprise Account Manager",
    "Strategic Account Manager",
    "Key Account Manager SaaS",
    "Account Director SaaS",
    "Customer Success Manager Enterprise",
    "Expansion Account Executive",
    "Responsable Grands Comptes SaaS",
    "Responsable Comptes Stratégiques",
    "Directeur de Clientèle SaaS",
]

SITES = ["linkedin", "indeed", "glassdoor", "hellowork"]

POSITIVE = {
    "strategic": 8,
    "enterprise": 8,
    "account manager": 10,
    "key account": 10,
    "grands comptes": 10,
    "customer success": 6,
    "expansion": 8,
    "renewal": 6,
    "upsell": 5,
    "saas": 8,
    "software": 4,
    "ecommerce": 7,
    "e-commerce": 7,
    "retail": 6,
    "customer experience": 6,
    "digital transformation": 5,
    "ai": 4,
    "workflow": 5,
    "product data": 7,
}

NEGATIVE = {
    "sdr": -20,
    "bdr": -20,
    "cold call": -15,
    "cold calling": -15,
    "hunter": -10,
    "door to door": -25,
    "cybersecurity": -6,
    "devops": -8,
    "database": -8,
    "construction": -10,
    "manufacturing": -8,
    "energy": -8,
}

BLOCKED_LOCATIONS = [
    "london", "united kingdom", "uk only", "germany", "austria", "spain",
    "netherlands", "belgium", "ireland", "malta", "cyprus", "denmark",
    "norway", "finland", "slovakia",
]

APPROVED_LOCATION_TERMS = [
    "france", "paris", "estonia", "tallinn", "sweden", "stockholm",
    "switzerland", "zurich", "zürich", "geneva", "italy", "milan", "milano",
    "prague", "czech", "slovenia", "ljubljana", "warsaw", "poland",
    "portugal", "lisbon", "porto", "luxembourg", "monaco",
]


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    return str(value).strip()


def is_location_blocked(row: dict) -> bool:
    location = clean(row.get("location")).lower()
    description = clean(row.get("description")).lower()

    # Explicit remote-from-excluded-country statements are blockers even when a board
    # result is surfaced through a France search.
    text = f"{location} {description}"

    blocked = any(term in text for term in BLOCKED_LOCATIONS)
    approved = any(term in text for term in APPROVED_LOCATION_TERMS)

    # When a description says remote "anywhere in Germany", etc., do not let a
    # generic France board location override the real employment restriction.
    explicit_excluded_remote = any(
        phrase in text
        for phrase in [
            "anywhere in germany",
            "based in germany",
            "remote in germany",
            "germany only",
            "uk based",
            "uk-based",
            "based in the uk",
            "london hybrid",
            "based in london",
        ]
    )

    return explicit_excluded_remote or (blocked and not approved)


def score_job(row: dict) -> tuple[int, int, str, bool]:
    text = " ".join([
        clean(row.get("title")),
        clean(row.get("company")),
        clean(row.get("description")),
        clean(row.get("location")),
    ]).lower()

    domain = 52
    for term, value in POSITIVE.items():
        if term in text:
            domain += value
    for term, value in NEGATIVE.items():
        if term in text:
            domain += value

    title = clean(row.get("title")).lower()
    if any(x in title for x in ["senior", "strategic", "enterprise", "director", "lead", "head"]):
        domain += 8
    if any(x in title for x in ["junior", "inside sales", "sales development", "business development representative"]):
        domain -= 20

    domain = max(0, min(99, domain))

    practical = domain
    remote = bool(row.get("is_remote"))
    if remote:
        practical += 5

    blocked = is_location_blocked(row)
    if blocked:
        # Geography is a hard practical constraint. A perfect domain match cannot
        # appear as a 99 practical fit when the job cannot be taken.
        practical = min(practical, 45)

    practical = max(0, min(99, practical))

    hunter = "Medium"
    if any(x in text for x in ["cold call", "cold calling", "hunter", "self-sourced", "self sourced", "build pipeline from scratch"]):
        hunter = "High"
        practical = max(0, practical - 10)
    elif any(x in text for x in ["renewal", "retention", "existing customers", "existing accounts", "portfolio", "upsell", "expansion"]):
        hunter = "Low"
        practical = min(99, practical + 5)

    return practical, domain, hunter, blocked


def salary_label(row: dict) -> str:
    min_amount = row.get("min_amount")
    max_amount = row.get("max_amount")
    currency = clean(row.get("currency"))
    interval = clean(row.get("interval"))
    try:
        if pd.notna(min_amount) or pd.notna(max_amount):
            lo = "" if pd.isna(min_amount) else f"{float(min_amount):,.0f}"
            hi = "" if pd.isna(max_amount) else f"{float(max_amount):,.0f}"
            if lo and hi:
                return f"{currency} {lo}–{hi} {interval}".strip()
            return f"{currency} {lo or hi} {interval}".strip()
    except Exception:
        pass
    return "Undisclosed"


def normalize(df: pd.DataFrame, search_term: str, site: str) -> list[dict]:
    rows = []
    for raw in df.to_dict(orient="records"):
        fit, domain_fit, hunter, blocked = score_job(raw)
        location = clean(raw.get("location"))
        url = clean(raw.get("job_url_direct")) or clean(raw.get("job_url"))
        title = clean(raw.get("title"))
        company = clean(raw.get("company"))
        if not title or not company or not url:
            continue

        job_id = re.sub(r"[^a-z0-9]+", "-", f"{site}-{company}-{title}".lower()).strip("-")[:120]

        status = "Review"
        tone = "good"
        rec = "INVESTIGATE"
        if blocked:
            status, tone, rec = "LOCATION BLOCKED", "bad", "SKIP UNLESS LOCATION CHANGES"
        elif fit >= 80:
            status, rec = "Strong match", "APPLY / REVIEW"
        elif fit < 60:
            status, tone, rec = "Low fit", "warn", "SKIP / REVIEW"

        rows.append({
            "id": job_id,
            "company": company,
            "title": title,
            "fit": fit,
            "domainFit": domain_fit,
            "hunter": hunter,
            "location": location or ("Remote" if raw.get("is_remote") else "Unspecified"),
            "salary": salary_label(raw),
            "rating": "—",
            "status": status,
            "statusTone": tone,
            "type": ("scanned remote" if raw.get("is_remote") else "scanned") + (" blocked" if blocked else ""),
            "rec": rec,
            "pros": [f"Found via {site}", f"Matched search: {search_term}"],
            "cons": (["Location conflicts with your approved work/relocation geography"] if blocked else []) + [
                "Automated first-pass score; employer-site verification still required"
            ],
            "diff": "CV tailoring is generated only after this role passes live-status and geographic verification.",
            "cover": "Generate only after verification.",
            "source": site,
            "sourceUrl": clean(raw.get("job_url")),
            "applyUrl": url,
            "datePosted": clean(raw.get("date_posted")),
            "description": clean(raw.get("description"))[:4000],
        })
    return rows


def read_state():
    if not STATE.exists():
        return {"hidden": [], "applied": []}
    try:
        data = json.loads(STATE.read_text(encoding="utf-8"))
        return {
            "hidden": data.get("hidden") or [],
            "applied": data.get("applied") or [],
        }
    except Exception:
        return {"hidden": [], "applied": []}


def run():
    collected: list[dict] = []
    errors: list[dict] = []

    for search_term in SEARCHES:
        for site in SITES:
            try:
                kwargs = dict(
                    site_name=[site],
                    search_term=search_term,
                    location="France",
                    results_wanted=25,
                    hours_old=336,
                    fetch_description=True,
                )
                if site in {"indeed", "glassdoor"}:
                    kwargs["country_indeed"] = "France"

                df = scrape_jobs(**kwargs)
                if df is not None and not df.empty:
                    collected.extend(normalize(df, search_term, site))
            except Exception as exc:
                errors.append({"site": site, "search": search_term, "error": str(exc)[:500]})

    unique = {}
    for job in collected:
        key = job["applyUrl"] or f'{job["company"]}|{job["title"]}|{job["location"]}'
        if key not in unique or job["fit"] > unique[key]["fit"]:
            unique[key] = job

    state = read_state()
    hidden = set(state["hidden"])

    jobs = [
        job for job in unique.values()
        if job["id"] not in hidden
    ]
    jobs = sorted(jobs, key=lambda j: (-j["fit"], j["company"].lower(), j["title"].lower()))

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": SITES,
        "searches": SEARCHES,
        "count": len(jobs),
        "jobs": jobs,
        "errors": errors,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(jobs)} jobs to {OUT}")
    if errors:
        print(f"{len(errors)} source/search attempts failed; details retained in JSON.")


if __name__ == "__main__":
    run()
