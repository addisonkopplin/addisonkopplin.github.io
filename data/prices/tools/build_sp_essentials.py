#!/usr/bin/env python3
"""Build ../data/sp-essentials.json: the S&P 500 deflated by overall prices and by an essentials price index.

Usage:  python3 tools/build_sp_essentials.py            # download fresh source files, rebuild JSON
        python3 tools/build_sp_essentials.py --offline  # rebuild from files already in tools/cache/
        python3 tools/build_sp_essentials.py --if-older-than 3   # skip downloads if the cache is newer than 3 days

Needs pandas, xlrd (Shiller .xls) and openpyxl (FHFA .xlsx). BLS refuses downloads unless the
User-Agent carries a contact email: set PRICES_CONTACT_EMAIL (or BLS_CONTACT). The output is written
atomically and only after the checks at the bottom pass; on any failure the old file stays.

Sources (all public):
  S&P 500     Robert Shiller, "U.S. Stock Markets 1871-Present and CAPE Ratio" (shillerdata.com, ie_data.xls):
              monthly average of daily closes and trailing 12-month dividends. Only derived index values
              (rebased growth indexes) are written out, never the raw price series.
  CPI-U       BLS bulk files https://download.bls.gov/pub/time.series/cu/ (not seasonally adjusted).
  Weights     BLS "Relative importance of components in the CPI, December 2025" (CPI-U column).
  Home prices FHFA House Price Index, purchase-only, monthly, U.S., not seasonally adjusted.
"""
import io, json, math, os, re, sys, tempfile, time, urllib.request, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "..", "data", "sp-essentials.json")
START = (1957, 1)          # energy CPI begins January 1957
CONTACT = (os.environ.get("PRICES_CONTACT_EMAIL") or os.environ.get("BLS_CONTACT") or "").strip()

BLS = "https://download.bls.gov/pub/time.series/cu/"
BLS_FILES = {  # series -> bulk file that holds it
    "CUUR0000SA0": "cu.data.1.AllItems", "CUUR0000SAF1": "cu.data.11.USFoodBeverage",
    "CUUR0000SAH1": "cu.data.12.USHousing", "CUUR0000SAM": "cu.data.15.USMedical",
    "CUUR0000SA0E": "cu.data.20.USCommoditiesServicesSpecial",
}
RI_URL = "https://www.bls.gov/cpi/tables/relative-importance/2025.htm"
RI_MONTH = "2025-12"       # weights' reference month (relative importance date)
SHILLER_PAGE = "https://shillerdata.com/"
SHILLER_FALLBACK = "https://img1.wsimg.com/blobby/go/e5e77e0b-59d1-44d9-ab25-4763ac982e53/downloads/ie_data.xls"
FHFA_URL = "https://www.fhfa.gov/hpi/download/monthly/hpi_po_monthly_hist.xlsx"

# key, BLS series, label, relative-importance row name
COMPONENTS = [
    ("food", "CUUR0000SAF1", "Food", "Food"),
    ("shelter", "CUUR0000SAH1", "Shelter", "Shelter"),
    ("energy", "CUUR0000SA0E", "Energy", "Energy"),
    ("medical", "CUUR0000SAM", "Medical care", "Medical care"),
]
DIV_CARRY_MAX = 6          # months a missing Shiller dividend may be carried forward


def ua():
    return f"Workbench-prices-refresh/1.0 ({CONTACT})" if CONTACT else "Workbench-prices-refresh/1.0"


def get(url, need_contact=False):
    if need_contact and "@" not in CONTACT:
        sys.exit("Set PRICES_CONTACT_EMAIL to a contact email (BLS returns 403 without one), or use --offline.")
    req = urllib.request.Request(url, headers={"User-Agent": ua()})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def cached(name, url_fn, offline, max_age_days, need_contact=False):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    fresh = os.path.exists(path) and (max_age_days is not None) and \
        (time.time() - os.path.getmtime(path) < max_age_days * 86400)
    if not offline and not fresh:
        b = get(url_fn(), need_contact)
        if len(b) < 1000:
            sys.exit(f"download too small: {name}")
        tmp = path + ".part"
        with open(tmp, "wb") as f:
            f.write(b)
        os.replace(tmp, path)
    if not os.path.exists(path):
        sys.exit(f"missing {path}; run without --offline")
    return path


def mi(y, m):
    return (y - START[0]) * 12 + (m - START[1])


def ym(i):
    t = START[1] - 1 + i
    return START[0] + t // 12, t % 12 + 1


def ymstr(i):
    y, m = ym(i)
    return f"{y}-{m:02d}"


def read_bls(path, sid):
    out = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if not line.startswith(sid):
                continue
            p = line.split("\t")
            if p[0].strip() != sid or not p[2].startswith("M") or p[2] == "M13":
                continue
            try:
                out[(int(p[1]), int(p[2][1:]))] = float(p[3])
            except ValueError:
                pass
    return out


def read_weights(path):
    import html as H
    t = open(path, encoding="utf-8", errors="replace").read()
    if "December 2025" not in t:
        sys.exit("relative importance page is not the December 2025 table")
    w = {}
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S):
        c = [H.unescape(re.sub("<[^>]+>", "", x)).strip() for x in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)]
        if len(c) >= 2 and c[0] not in w:
            try:
                w[c[0]] = float(c[1])
            except ValueError:
                pass
    return w


def read_shiller(path):
    import pandas as pd
    df = pd.read_excel(path, sheet_name="Data", header=None, skiprows=8)
    out, notes = {}, []
    for _, r in df.iterrows():
        try:
            d = float(r[0])
        except (TypeError, ValueError):
            if isinstance(r[1], str):
                notes.append(r[1])
            continue
        if math.isnan(d):
            continue
        y = int(d); m = int(round((d - y) * 100))
        p = pd.to_numeric(r[1], errors="coerce"); dv = pd.to_numeric(r[2], errors="coerce")
        rtr = pd.to_numeric(r[9], errors="coerce"); cpi = pd.to_numeric(r[4], errors="coerce")
        out[(y, m)] = (None if pd.isna(p) else float(p), None if pd.isna(dv) else float(dv),
                       None if pd.isna(rtr) else float(rtr), None if pd.isna(cpi) else float(cpi))
    return out, notes


def read_fhfa(path):
    import pandas as pd
    df = pd.read_excel(path, header=None)
    hdr = None
    for i in range(10):
        if str(df.iat[i, 0]).strip() == "Month":
            hdr = i; break
    if hdr is None:
        sys.exit("FHFA layout changed: no Month header")
    col = None
    for j in range(df.shape[1]):
        h = re.sub(r"\s+", " ", str(df.iat[hdr, j]))
        if h.startswith("USA") and "(NSA)" in h:
            col = j
    if col is None:
        sys.exit("FHFA layout changed: no USA (NSA) column")
    out = {}
    for i in range(hdr + 1, df.shape[0]):
        d = pd.to_datetime(df.iat[i, 0], errors="coerce"); v = pd.to_numeric(df.iat[i, col], errors="coerce")
        if pd.isna(d) or pd.isna(v):
            continue
        out[(d.year, d.month)] = float(v)
    return out


def to_array(dct, n):
    return [dct.get(ym(i)) for i in range(n)]


def fill_gaps(a, first, last):
    """Fill isolated missing months inside [first, last] by geometric interpolation; return filled months."""
    filled = []
    for i in range(first + 1, last):
        if a[i] is None and a[i - 1] is not None and a[i + 1] is not None:
            a[i] = math.sqrt(a[i - 1] * a[i + 1]); filled.append(ymstr(i))
    return filled


def first_last(a):
    idx = [i for i, v in enumerate(a) if v is not None]
    return (idx[0], idx[-1]) if idx else (None, None)


def sig(x, n=6):
    if x is None:
        return None
    return float(f"{x:.{n}g}")


def main():
    args = sys.argv[1:]
    offline = "--offline" in args
    max_age = None
    if "--if-older-than" in args:
        max_age = float(args[args.index("--if-older-than") + 1])
    # ---- sources
    bls_paths = {sid: cached(fn, (lambda fn=fn: BLS + fn), offline, max_age, True) for sid, fn in BLS_FILES.items()}
    ri_path = cached("relative-importance-2025.htm", lambda: RI_URL, offline, max_age, True)

    def shiller_url():
        try:
            page = get(SHILLER_PAGE).decode("utf-8", "replace")
            m = re.search(r'href="(//img1\.wsimg\.com/[^"]*ie_data\.xls[^"]*)"', page)
            return "https:" + m.group(1) if m else SHILLER_FALLBACK
        except Exception:
            return SHILLER_FALLBACK
    sh_path = cached("ie_data.xls", shiller_url, offline, max_age)
    fh_path = cached("hpi_po_monthly_hist.xlsx", lambda: FHFA_URL, offline, max_age)

    # ---- read
    ri = read_weights(ri_path)
    raw_w = {k: ri[row] for k, _, _, row in COMPONENTS}
    tot = sum(raw_w.values())
    weights = {k: raw_w[k] / tot for k in raw_w}
    shiller, sh_notes = read_shiller(sh_path)
    fhfa = read_fhfa(fh_path)

    cpi_d = read_bls(bls_paths["CUUR0000SA0"], "CUUR0000SA0")
    comp_d = {k: read_bls(bls_paths[sid], sid) for k, sid, _, _ in COMPONENTS}

    # ---- month range: through the latest month with CPI and every component and a Shiller price
    def last_key(d):
        return max(k for k, v in d.items() if v is not None)
    cands = [last_key(cpi_d)] + [last_key(d) for d in comp_d.values()] + \
        [max(k for k, v in shiller.items() if v[0] is not None)]
    end = min(cands)
    n = mi(*end) + 1

    cpi = to_array(cpi_d, n)
    comps = {k: to_array(comp_d[k], n) for k in comp_d}
    filled = sorted(set(fill_gaps(cpi, 0, n - 1) + sum((fill_gaps(comps[k], 0, n - 1) for k in comps), [])))
    for k, a in list(comps.items()) + [("cpi", cpi)]:
        if any(v is None for v in a):
            sys.exit(f"{k} has missing months that cannot be filled: {[ymstr(i) for i, v in enumerate(a) if v is None][:5]}")

    # Shiller: price and dividends; carry a missing recent dividend forward (documented)
    px, dv, div_est = [], [], []
    last_d = None; carried = 0
    for i in range(n):
        p, d, _, _ = shiller.get(ym(i), (None, None, None, None))
        if p is None:
            sys.exit(f"Shiller price missing for {ymstr(i)}")
        if d is None:
            carried += 1
            if last_d is None or carried > DIV_CARRY_MAX:
                sys.exit(f"Shiller dividend missing for {ymstr(i)}")
            d = last_d; div_est.append(ymstr(i))
        else:
            last_d = d; carried = 0
        px.append(p); dv.append(d)
    tr = [1.0]
    for i in range(1, n):
        tr.append(tr[-1] * (px[i] + dv[i] / 12.0) / px[i - 1])

    # Essentials: fixed basket at the weights' reference month (Laspeyres, like the CPI between weight updates)
    ref = mi(int(RI_MONTH[:4]), int(RI_MONTH[5:]))
    def basket(series_by_key):
        return [100.0 * sum(weights[k] * series_by_key[k][i] / series_by_key[k][ref] for k in weights) for i in range(n)]
    ess = basket(comps)
    hpi = to_array(fhfa, n)
    h0, h1 = first_last(hpi)
    hpi_filled = fill_gaps(hpi, h0, h1)
    if hpi[ref] is None:
        sys.exit("FHFA HPI missing the weights' reference month")
    essh = [None] * n
    for i in range(h0, h1 + 1):
        if hpi[i] is not None:
            essh[i] = 100.0 * sum(weights[k] * (hpi[i] / hpi[ref] if k == "shelter" else comps[k][i] / comps[k][ref]) for k in weights)

    # ---- checks against Shiller's own real total return column (uses his CPI), 2000-09 -> latest full-dividend month
    def chk(a, b):
        i, j = mi(*a), mi(*b)
        mine = (tr[j] / tr[i]) / (shiller[b][3] / shiller[a][3])
        his = shiller[b][2] / shiller[a][2]
        return mine, his
    last_div = max(k for k, v in shiller.items() if v[1] is not None)
    m1, h1v = chk((2000, 9), last_div)
    m2, h2v = chk((1960, 1), last_div)
    for mine, his in ((m1, h1v), (m2, h2v)):
        if abs(mine / his - 1) > 0.005:
            sys.exit(f"check failed: real total return {mine:.4f} vs Shiller {his:.4f}")
    # ess must sit between its components; weights must sum to 1
    assert abs(sum(weights.values()) - 1) < 1e-9
    for i in range(n):
        lo = min(comps[k][i] / comps[k][ref] for k in comps) * 100 - 1e-6
        hi = max(comps[k][i] / comps[k][ref] for k in comps) * 100 + 1e-6
        assert lo <= ess[i] <= hi, ymstr(i)

    # ---- write (derived values only: S&P as rebased growth indexes, base = end month = 100)
    def rebase(a, b):
        return [sig(100.0 * v / a[b]) if v is not None else None for v in a]
    e = n - 1
    out = {
        "built": datetime.date.today().isoformat(),
        "start": ymstr(0), "end": ymstr(e),
        "note": "S&P 500 growth indexes derived from Robert Shiller's public monthly data (monthly average prices, "
                "trailing 12-month dividends). Price indexes from the U.S. Bureau of Labor Statistics (CPI-U, not "
                "seasonally adjusted) and FHFA (purchase-only House Price Index, U.S., not seasonally adjusted).",
        "weights_month": RI_MONTH,
        "components": [{"key": k, "id": sid, "label": lab, "ri": raw_w[k], "w": round(weights[k], 6)} for k, sid, lab, _ in COMPONENTS],
        "filled": filled, "div_estimated": div_est, "hpi_first": ymstr(h0), "hpi_last": ymstr(h1), "hpi_filled": hpi_filled,
        "shiller_last_dividend": f"{last_div[0]}-{last_div[1]:02d}",
        "check": {"real_tr_2000_09": [round(m1, 4), round(h1v, 4)], "real_tr_1960_01": [round(m2, 4), round(h2v, 4)],
                  "through": f"{last_div[0]}-{last_div[1]:02d}"},
        "series": {
            "tr": rebase(tr, e), "px": rebase(px, e),
            "cpi": [round(v, 3) for v in cpi],
            "ess": [sig(v) for v in ess], "essh": [sig(v) for v in essh],
            "hpi": [sig(v) for v in hpi],
            **{k: [round(v, 3) for v in comps[k]] for k in comps},
        },
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(OUT), suffix=".part")
    with os.fdopen(fd, "w") as f:
        json.dump(out, f, separators=(",", ":"), allow_nan=False)
    os.chmod(tmp, 0o644)
    os.replace(tmp, OUT)
    print(f"wrote {OUT}: {ymstr(0)}..{ymstr(e)} ({n} months); home prices to {ymstr(h1)}; "
          f"dividends carried forward for {div_est}; filled {filled}")
    print(f"check real TR 2000-09..{last_div}: mine {m1:.4f} Shiller {h1v:.4f}; 1960-01: mine {m2:.4f} Shiller {h2v:.4f}")
    print("weights:", {k: round(v, 4) for k, v in weights.items()}, "raw:", raw_w)


if __name__ == "__main__":
    main()
