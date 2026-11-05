from __future__ import annotations

"""Profile job discovery: title + geographic scope first, CV/industry fit later.

This scanner discovers postings on job boards. It does NOT verify live vacancies
at employer-hosted applications, and must never label results APPLY/verified.
No candidate CV, LinkedIn profile URL, or private text is sent to job boards.
"""
import hashlib
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from jobspy import scrape_jobs

RESULTS_PER_QUERY = 60
MAX_SEARCH_TITLES = 15
SITES = ("indeed", "linkedin")

# Broaden search titles only where they express the same senior responsibility.
ROLE_ALIASES = {
    "directeur bu": ["directeur de business unit", "business unit director", "directeur d'activité"],
    "directeur de bu": ["directeur de business unit", "business unit director"],
    "directeur de business unit": ["business unit director", "directeur d’activité"],
    "directeur des ventes": ["directeur commercial", "sales director"],
    "directeur du developpement commercial international": ["international sales director", "directeur commercial international"],
    "directeur business unit": ["directeur de business unit", "business unit director"],
    "directeur general": ["directeur général", "general manager", "directeur de filiale"],
    "directeur commercial": ["directeur commercial", "directrice commerciale", "head of sales"],
    "directeur commercial international": ["directeur commercial international", "international sales director", "directeur export"],
}

HARD_TITLE_EXCLUSIONS = [
    "assistant commercial", "commercial terrain", "sales development representative",
    "business development representative", "alternance", "apprenti", "stage ",
    "stagiaire", "vendeur", "teleprospect", "téléprospect", "commercial sedentaire",
    "commercial sédentaire", "account executive", "inside sales", "sales representative",
    "directeur general des services", "directrice generale des services", "directeur de cabinet", "directeur d ecole",
]

def clean(value):
    if value is None:
        return ""
    try:
        import pandas as pd
        if pd.isna(value):
            return ""
    except (TypeError, ValueError, ImportError):
        pass
    return str(value).strip()

def fold(value):
    text = unicodedata.normalize("NFKD", clean(value))
    return "".join(ch for ch in text if not unicodedata.combining(ch)).casefold()

def safe_id(value):
    value = clean(value)
    if not re.fullmatch(r"[a-zA-Z0-9_-]{4,90}", value) or value == "owner":
        raise ValueError("Invalid profile identifier")
    return value

def titles(raw):
    items = [x.strip(" .") for x in re.split(r"[;,/\n]+|\.\s+(?=[A-ZÉÈÊ])", clean(raw)) if x.strip(" .")]
    return list(dict.fromkeys(items))[:MAX_SEARCH_TITLES]

def expanded_titles(roles):
    variants = []
    seen = set()
    # Search each explicitly selected role before adding English variants.
    for term in roles:
        key = fold(term)
        if key not in seen:
            seen.add(key)
            variants.append(term)
    for role in roles:
        for term in ROLE_ALIASES.get(fold(role), []):
            key = fold(term)
            if key not in seen:
                seen.add(key)
                variants.append(term)
    return variants[:15]

def search_locations(raw):
    value = fold(raw)
    places = []
    if "bretagne" in value or "brittany" in value:
        places.append("Bretagne, France")
    if "france" in value or "bretagne" in value or "brittany" in value or not value:
        places.append("France")
    # Additional French cities named explicitly can be searched as focused queries.
    for city in ("rennes", "brest", "vannes", "saint-malo", "nantes", "quimper", "lorient"):
        if city in value:
            places.insert(0, city.title() + ", France")
    return list(dict.fromkeys(places))[:3] or ["France"]

def title_quality(title, original_roles):
    target = fold(title)
    if any(fold(term) in target for term in HARD_TITLE_EXCLUSIONS):
        return 0
    roles = [fold(x) for x in original_roles]
    if any(role == target for role in roles):
        return 100
    if any(role in target for role in roles):
        return 95
    if any(alias in target for role in roles for alias in [fold(x) for x in ROLE_ALIASES.get(role, [])]):
        return 91
    # Keep a broad pool of related senior executive openings for review.
    senior_patterns = [
        "directeur general", "directrice generale", "general manager", "managing director",
        "directeur commercial", "directrice commerciale", "sales director", "head of sales",
        "directeur export", "export director", "international sales director",
        "directeur business unit", "directeur de business unit", "business unit director",
        "directeur de filiale", "directeur d'activite", "directrice d'activite",
    ]
    if any(term in target for term in senior_patterns):
        return 83
    return 0

def region_quality(place):
    p = fold(place)
    breton = (
        "bretagne", "brittany", "rennes", "brest", "quimper", "vannes",
        "saint-malo", "saint brieuc", "saint-brieuc", "lorient", "pleurtuit",
        "dinard", "cotes-d'armor", "finistere", "ille-et-vilaine", "morbihan"
    )
    if any(term in p for term in breton):
        return 12, "Bretagne"
    if any(term in p for term in ("france", "paris", "lyon", "nantes", "lille", "bordeaux",
                                  "toulouse", "marseille", "montpellier", "angers",
                                  "normandie", "loire", "annecy", "dijon")):
        return 4, "France"
    if "remote" in p or "teletravail" in p or "télétravail" in p:
        return 1, "Remote — French eligibility unconfirmed"
    return 0, "Location needs review"

def normalized_url(url):
    try:
        parsed = urlsplit(url)
        return urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path.rstrip("/"), "", ""))
    except ValueError:
        return url

def build_query_plan(roles, raw_locations):
    """Bound job-board calls: title search is broad, Bretagne gets a focused pass."""
    variants = expanded_titles(roles)
    primary = variants[:6]
    french_scope = search_locations(raw_locations)
    # France-wide searches include Bretagne; limit the local second pass to
    # the most important original titles, on Indeed only.
    plan = [(role, "France", site) for role in primary for site in SITES]
    if any("bretagne" in fold(x) for x in french_scope):
        plan.extend((role, "Bretagne", "indeed") for role in roles[:4])
    return list(dict.fromkeys(plan))[:16]


def collect_query(query):
    role, location, site = query
    options = {
        "site_name": [site],
        "search_term": role,
        "location": location,
        "results_wanted": RESULTS_PER_QUERY,
        "hours_old": 24 * 30,
        "fetch_description": False,
    }
    if site == "indeed":
        options["country_indeed"] = "France"
    # Each call is independently logged; worker threads bound concurrency.
    dataframe = scrape_jobs(**options)
    if dataframe is None or dataframe.empty:
        return query, []
    return query, dataframe.to_dict(orient="records")


def main():
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from time import monotonic

    profile_id = safe_id(sys.argv[1])
    original_roles = titles(sys.argv[2])
    original_locations = clean(sys.argv[3]) or "France"
    if not original_roles:
        raise ValueError("Provide at least one job title")

    plan = build_query_plan(original_roles, original_locations)
    results = {}
    errors = []
    started = monotonic()
    print(f"Starting {len(plan)} focused job queries in 3 workers for profile {profile_id}", flush=True)

    with ThreadPoolExecutor(max_workers=3) as pool:
        future_map = {pool.submit(collect_query, query): query for query in plan}
        for number, future in enumerate(as_completed(future_map), start=1):
            role, location, site = future_map[future]
            try:
                _, rows = future.result()
                print(f"[{number}/{len(plan)}] {site} {location}: {role} -> {len(rows)} raw", flush=True)
            except Exception as exc:
                errors.append({"site": site, "query": role, "location": location,
                               "error": str(exc)[:300]})
                print(f"[{number}/{len(plan)}] FAILED {site} {location}: {role}: {exc}", flush=True)
                continue
            for raw in rows:
                title, company = clean(raw.get("title")), clean(raw.get("company"))
                url = clean(raw.get("job_url_direct")) or clean(raw.get("job_url"))
                if not title or not company or not url.startswith(("http://", "https://")):
                    continue
                quality = title_quality(title, original_roles)
                if quality == 0:
                    continue
                where = clean(raw.get("location")) or "Unspecified"
                region_bonus, region_label = region_quality(where)
                place_folded = fold(where)
                foreign_terms = ("belgium", "belgique", "germany", "allemagne", "spain",
                                 "espagne", "united kingdom", "switzerland", "suisse",
                                 "italy", "italie", "portugal", "poland")
                if region_bonus == 0 and any(term in place_folded for term in foreign_terms):
                    continue
                match = min(99, max(50, quality - 7 + region_bonus))
                dedup = normalized_url(url)
                jid = "profile-" + hashlib.sha1(dedup.encode()).hexdigest()[:20]
                industry = clean(raw.get("company_industry")) or clean(raw.get("industry"))
                item = {
                    "id": jid, "company": company, "title": title, "fit": match,
                    "industry": industry or "Not specified",
                    "domainFit": quality, "hunter": "Unknown", "location": where,
                    "salary": "Undisclosed", "rating": "—",
                    "status": "Unverified vacancy", "statusTone": "warn",
                    "type": "scanned", "rec": "INVESTIGATE",
                    "pros": ["Executive title is relevant", "Location category: " + region_label],
                    "cons": ["Verify the current employer-hosted application page",
                             "Check mandatory sector and leadership requirements"],
                    "diff": "Confirm employer status and requirements before CV tailoring.",
                    "cover": "Not generated until verification.",
                    "source": site, "sourceUrl": url, "applyUrl": url,
                    "datePosted": clean(raw.get("date_posted")),
                    "description": "",
                    "verificationStatus": "unverified",
                    "locationCategory": region_label, "matchedSearchTerm": role,
                }
                previous = results.get(dedup)
                if previous is None or match > previous["fit"]:
                    results[dedup] = item

    jobs = sorted(results.values(), key=lambda x: (-x["fit"], x["company"].casefold()))
    output = Path("data/profile-scans") / (profile_id + ".json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        "profileId": profile_id, "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "jobspy-discovery", "verifiedLive": False,
        "strategy": "title-and-location-first-v2",
        "roles": original_roles, "locations": search_locations(original_locations),
        "queriesAttempted": len(plan), "elapsedSeconds": round(monotonic()-started, 1),
        "count": len(jobs), "highRelevanceCount": sum(j["fit"] >= 80 for j in jobs),
        "jobs": jobs, "errors": errors
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Done: {len(jobs)} unverified roles, {len(plan)} queries, "
          f"{len(errors)} source failures, {round(monotonic()-started)}s", flush=True)

if __name__ == "__main__":
    main()
