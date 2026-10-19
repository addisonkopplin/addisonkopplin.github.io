#!/usr/bin/env python3
"""Rebuild ../data/prices.json from BLS bulk flat files (keyless).

Usage:  python3 tools/refresh_data.py            # download fresh files, rebuild JSON
        python3 tools/refresh_data.py --offline  # rebuild from files already in tools/cache/

Standard library only. Source files: https://download.bls.gov/pub/time.series/{cu,pc}/
These are bulk flat files, not the BLS API, so no registration key is needed. BLS does refuse
downloads (HTTP 403) unless the User-Agent includes a contact email. Set one first:
    export PRICES_CONTACT_EMAIL=you@example.com
(BLS_CONTACT is also accepted.) --offline needs no contact.
"""
import json, os, sys, urllib.request, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "..", "data", "prices.json")
def _contact():
    """Contact email for the User-Agent, from PRICES_CONTACT_EMAIL (or BLS_CONTACT). Empty if unset."""
    return (os.environ.get("PRICES_CONTACT_EMAIL") or os.environ.get("BLS_CONTACT") or "").strip()
CONTACT = _contact()
START_YEAR = 2000
BASE = "https://download.bls.gov/pub/time.series/"
FILES = ["cu/cu.data.1.AllItems", "cu/cu.data.11.USFoodBeverage", "cu/cu.data.12.USHousing",
         "cu/cu.data.14.USTransportation", "cu/cu.data.15.USMedical", "cu/cu.data.16.USRecreation",
         "cu/cu.data.17.USEducationAndCommunication", "cu/cu.data.18.USOtherGoodsAndServices",
         "pc/pc.data.75.Construction"]

# key, BLS series id, short label used in sentences, group
SERIES = [
    ("all", "CUUR0000SA0", "Overall prices", "Baseline"),
    ("electricity", "CUUR0000SEHF01", "Electricity", "Home and utilities"),
    ("gas-utility", "CUUR0000SEHF02", "Natural gas (piped)", "Home and utilities"),
    ("rent", "CUUR0000SEHA", "Rent", "Home and utilities"),
    ("water", "CUUR0000SEHG", "Water, sewer and trash", "Home and utilities"),
    ("renters-insurance", "CUUR0000SEHD", "Tenants' and household insurance", "Home and utilities"),
    ("gasoline", "CUUR0000SETB01", "Gasoline", "Cars"),
    ("auto-repair", "CUUR0000SETD", "Auto repair", "Cars"),
    ("car-insurance", "CUUR0000SETE", "Car insurance", "Cars"),
    ("used-cars", "CUUR0000SETA02", "Used cars and trucks", "Cars"),
    ("new-cars", "CUUR0000SETA01", "New cars and trucks", "Cars"),
    ("car-parts", "CUUR0000SETC", "Car parts and equipment", "Cars"),
    ("groceries", "CUUR0000SAF11", "Groceries", "Food"),
    ("restaurants", "CUUR0000SEFV", "Food away from home", "Food"),
    ("eggs", "CUUR0000SEFH", "Eggs", "Food"),
    ("beef", "CUUR0000SEFC", "Beef and veal", "Food"),
    ("dairy", "CUUR0000SEFJ", "Dairy", "Food"),
    ("coffee", "CUUR0000SEFP01", "Coffee", "Food"),
    ("physicians", "CUUR0000SEMC01", "Physicians' services", "Health and care"),
    ("hospital", "CUUR0000SEMD", "Hospital services", "Health and care"),
    ("prescriptions", "CUUR0000SEMF01", "Prescription drugs", "Health and care"),
    ("childcare", "CUUR0000SEEB03", "Day care and preschool", "Health and care"),
    ("vet", "CUUR0000SS62054", "Vet services", "Health and care"),
    ("pet-services", "CUUR0000SS62053", "Pet services, excluding vet", "Health and care"),
    ("airfare", "CUUR0000SETG01", "Airline fares", "Services and travel"),
    ("personal-care", "CUUR0000SEGC", "Haircuts and other personal care services", "Services and travel"),
    ("tuition", "CUUR0000SEEB01", "College tuition and fees", "Services and travel"),
    ("internet", "CUUR0000SEEE03", "Internet service", "Services and travel"),
    ("wireless", "CUUR0000SEED03", "Cell phone service", "Services and travel"),
    ("roofing", "PCU23816X23816X", "Roofing work", "Contractors (producer prices)"),
    ("plumbing-hvac", "PCU23822X23822X", "Plumbing and HVAC work", "Contractors (producer prices)"),
    ("electrical", "PCU23821X23821X", "Electrical work", "Contractors (producer prices)"),
    ("foundation", "PCU23811X23811X", "Foundation, structure and exterior work", "Contractors (producer prices)"),
]

def fetch(rel, offline):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, rel.split("/")[-1])
    if not offline:
        if "@" not in CONTACT:
            sys.exit("Set PRICES_CONTACT_EMAIL to a contact email (BLS returns 403 without one), or use --offline.")
        req = urllib.request.Request(BASE + rel, headers={"User-Agent": f"Workbench-prices-refresh/1.0 ({CONTACT})"})
        with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
            f.write(r.read())
    if not os.path.exists(path):
        sys.exit(f"missing {path}; run without --offline")
    return path

def read_titles(path):
    t = {}
    with open(path, encoding="latin-1") as f:
        hdr = [h.strip() for h in f.readline().split("\t")]
        i_id, i_t = hdr.index("series_id"), hdr.index("series_title")
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) > i_t: t[p[i_id].strip()] = p[i_t].strip()
    return t

def main():
    offline = "--offline" in sys.argv
    want = {s[1] for s in SERIES}
    obs = {}  # id -> {(y,m): (value, footnote)}
    for rel in FILES:
        with open(fetch(rel, offline), encoding="latin-1") as f:
            f.readline()
            for line in f:
                p = [x.strip() for x in line.split("\t")]
                if len(p) < 4 or p[0] not in want: continue
                y, per = int(p[1]), p[2]
                if y < START_YEAR or not per.startswith("M") or per == "M13": continue
                try: v = float(p[3])
                except ValueError: continue  # "-" = not published
                obs.setdefault(p[0], {})[(y, int(per[1:]))] = (v, p[4] if len(p) > 4 else "")
    titles = {}
    for rel in ("cu/cu.series", "pc/pc.series"):
        titles.update(read_titles(fetch(rel, offline)))
    missing_ids = want - obs.keys()
    if missing_ids: sys.exit(f"no data for {sorted(missing_ids)}")
    last = max(max(o) for o in obs.values())
    months = [(y, m) for y in range(START_YEAR, last[0] + 1) for m in range(1, 13) if (y, m) <= last]
    out = []
    for key, sid, label, group in SERIES:
        o = obs[sid]
        first = min(o); lastm = max(o)
        v = [round(o[k][0], 3) if k in o else None for k in months]
        gaps = [f"{y}-{m:02d}" for (y, m) in months if first <= (y, m) <= lastm and (y, m) not in o]
        prelim = [f"{y}-{m:02d}" for (y, m) in months if (y, m) in o and "P" in o[(y, m)][1]]
        out.append({"key": key, "id": sid, "label": label, "group": group,
                    "kind": "ppi" if sid.startswith("PCU") else "cpi",
                    "title": titles.get(sid, ""), "first": f"{first[0]}-{first[1]:02d}",
                    "last": f"{lastm[0]}-{lastm[1]:02d}", "gaps": gaps, "prelim": prelim, "v": v})
    doc = {"built": datetime.date.today().isoformat(), "start": f"{START_YEAR}-01",
           "end": f"{last[0]}-{last[1]:02d}",
           "note": "Not seasonally adjusted index values. CPI-U, U.S. city average, and PPI by industry, from the U.S. Bureau of Labor Statistics.",
           "series": out}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f: json.dump(doc, f, separators=(",", ":"))
    print(f"wrote {OUT}: {len(out)} series, {doc['start']}..{doc['end']}, {os.path.getsize(OUT)//1024} KB")
    for s in out:
        if s["gaps"]: print(f"  {s['id']} gaps: {', '.join(s['gaps'])}")

if __name__ == "__main__":
    main()
