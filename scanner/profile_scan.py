from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from jobspy import scrape_jobs

def clean(x):
    return str(x or "").strip()

def safe_id(value):
    value = clean(value)
    if not re.fullmatch(r"[a-zA-Z0-9_-]{4,90}", value) or value == "owner":
        raise ValueError("Invalid profile identifier")
    return value

def titles(raw):
    # Input is deliberately only search titles, not someone's private CV.
    words = [v.strip() for v in raw.replace("\n", ";").split(";") if v.strip()]
    return list(dict.fromkeys(words))[:12]

def score(title, roles):
    needle = clean(title).lower()
    matches = sum(1 for role in roles if needle == role.lower() or role.lower() in needle)
    return 78 if matches else 58

def main():
    ident = safe_id(sys.argv[1])
    roles = titles(sys.argv[2])
    country = clean(sys.argv[3]) or "France"
    if not roles:
        raise ValueError("No search roles supplied")
    # This is a discovery scan, NOT an employer verified vacancy feed.
    found = {}
    errors = []
    sites = ["indeed", "linkedin"]
    locations = ["France"]
    if "bretagne" in country.lower() or "brittany" in country.lower():
        locations = ["Bretagne", "France"]
    for role in roles:
        for location in locations:
            for site in sites:
                try:
                    df = scrape_jobs(site_name=[site], search_term=role, location=location,
                                     results_wanted=35, hours_old=24*30, fetch_description=True,
                                     country_indeed="France")
                    if df is None or df.empty:
                        continue
                    for raw in df.to_dict(orient="records"):
                        title = clean(raw.get("title"))
                        company = clean(raw.get("company"))
                        url = clean(raw.get("job_url_direct")) or clean(raw.get("job_url"))
                        if not title or not company or not url.startswith(("https://", "http://")):
                            continue
                        key = url.split("?")[0].rstrip("/")
                        import hashlib
                        jid = "profile-" + hashlib.sha1(key.encode()).hexdigest()[:20]
                        posted = clean(raw.get("date_posted"))
                        where = clean(raw.get("location")) or location
                        match = score(title, roles)
                        found[key] = {
                            "id": jid, "company": company, "title": title,
                            "fit": match, "domainFit": match,
                            "hunter": "Unknown", "location": where,
                            "salary": "Undisclosed", "rating": "—",
                            "status": "Unverified — check employer site", "statusTone": "warn",
                            "type": "scanned", "rec": "INVESTIGATE",
                            "pros": ["Found via " + site, "Matches search title: " + role],
                            "cons": ["Source may be stale; check current employer careers page and mandatory requirements"],
                            "diff": "Tailoring unavailable until the posting is verified and candidate CV is configured.",
                            "cover": "Do not generate until verification.",
                            "source": site, "sourceUrl": url, "applyUrl": url,
                            "datePosted": posted, "description": clean(raw.get("description"))[:4500],
                            "verificationStatus": "unverified",
                        }
                except Exception as exc:
                    errors.append({"source": site, "role": role, "location": location, "message": str(exc)[:280]})
    jobs = sorted(found.values(), key=lambda j: (-j["fit"], j["company"].lower()))
    output = Path("data/profile-scans") / (ident + ".json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        "profileId": ident, "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "jobspy-discovery", "verifiedLive": False,
        "count": len(jobs), "jobs": jobs, "errors": errors
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Discovery scan exported {len(jobs)} unverified candidates to {output}")

if __name__ == "__main__":
    main()
