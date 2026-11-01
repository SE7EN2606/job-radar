from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from jobspy import scrape_jobs

OUT = Path("data/jobs.json")

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


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    return str(value).strip()


def score_job(row: dict) -> tuple[int, str]:
    text = " ".join([
        clean(row.get("title")),
        clean(row.get("company")),
        clean(row.get("description")),
        clean(row.get("location")),
    ]).lower()

    score = 52
    for term, value in POSITIVE.items():
        if term in text:
            score += value
    for term, value in NEGATIVE.items():
        if term in text:
            score += value

    location = clean(row.get("location")).lower()
    remote = bool(row.get("is_remote"))
    if remote:
        score += 8
    if any(term in location for term in BLOCKED_LOCATIONS):
        score -= 25

    # Prefer senior commercial roles, penalize obvious junior/transactional roles.
    title = clean(row.get("title")).lower()
    if any(x in title for x in ["senior", "strategic", "enterprise", "director", "lead", "head"]):
        score += 8
    if any(x in title for x in ["junior", "inside sales", "sales development", "business development representative"]):
        score -= 20

    score = max(0, min(99, score))

    hunter = "Medium"
    if any(x in text for x in ["cold call", "cold calling", "hunter", "self-sourced", "self sourced", "build pipeline from scratch"]):
        hunter = "High"
    elif any(x in text for x in ["renewal", "retention", "existing customers", "existing accounts", "portfolio", "upsell", "expansion"]):
        hunter = "Low"

    return score, hunter


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
        fit, hunter = score_job(raw)
        location = clean(raw.get("location"))
        url = clean(raw.get("job_url_direct")) or clean(raw.get("job_url"))
        title = clean(raw.get("title"))
        company = clean(raw.get("company"))
        if not title or not company or not url:
            continue

        status = "Review"
        tone = "good"
        rec = "INVESTIGATE"
        if fit >= 80:
            status, rec = "Strong match", "APPLY / REVIEW"
        elif fit < 60:
            status, tone, rec = "Low fit", "warn", "SKIP / REVIEW"

        if any(x in location.lower() for x in BLOCKED_LOCATIONS):
            status, tone, rec = "LOCATION CHECK", "bad", "SKIP UNLESS FLEXIBLE"

        rows.append({
            "id": re.sub(r"[^a-z0-9]+", "-", f"{site}-{company}-{title}".lower()).strip("-")[:120],
            "company": company,
            "title": title,
            "fit": fit,
            "domainFit": fit,
            "hunter": hunter,
            "location": location or ("Remote" if raw.get("is_remote") else "Unspecified"),
            "salary": salary_label(raw),
            "rating": "—",
            "status": status,
            "statusTone": tone,
            "type": "scanned remote" if raw.get("is_remote") else "scanned",
            "rec": rec,
            "pros": [f"Found via {site}", f"Matched search: {search_term}"],
            "cons": ["Automated first-pass score; employer-site verification still required"],
            "diff": "CV tailoring is generated only after this role passes live-status and geographic verification.",
            "cover": "Generate only after verification.",
            "source": site,
            "sourceUrl": clean(raw.get("job_url")),
            "applyUrl": url,
            "datePosted": clean(raw.get("date_posted")),
            "description": clean(raw.get("description"))[:4000],
        })
    return rows


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

    # De-duplicate on apply URL first, then company/title/location.
    unique = {}
    for job in collected:
        key = job["applyUrl"] or f'{job["company"]}|{job["title"]}|{job["location"]}'
        if key not in unique or job["fit"] > unique[key]["fit"]:
            unique[key] = job

    jobs = sorted(unique.values(), key=lambda j: (-j["fit"], j["company"].lower(), j["title"].lower()))

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
