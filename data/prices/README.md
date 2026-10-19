# Prices vs. Inflation

A static page that compares how much a category's price has changed since a chosen year with the change in overall prices (CPI-U, all items). It runs in the browser with plain JavaScript and fetches only `data/prices.json`, served with the page.

## Files
- `index.html`, `app.css`, `app.js`: the page. The header and footer come from the shared site template (see the site README).
- `data/prices.json`: monthly, not seasonally adjusted BLS index values from January 2000. Each series has `id`, `label`, `group`, `kind` (`cpi` or `ppi`), official `title`, `first`/`last` month, `gaps` (months BLS did not publish, such as 2025-10), `prelim` (preliminary PPI months) and `v` (one value per month from `start`, `null` where missing).
- `tools/refresh_data.py`: rebuilds the JSON from the BLS bulk flat files. Standard library only.

## Updating the data
CPI is published mid-month for the previous month. BLS refuses downloads unless the User-Agent includes a contact email, so set one first:

    export PRICES_CONTACT_EMAIL=you@example.com
    python3 tools/refresh_data.py

`--offline` rebuilds from the files cached in `tools/cache/` and needs no contact. Do not publish `tools/cache/` (about 21 MB). To add or remove a category, edit `SERIES` in the script; to change the summary wording, edit `PHRASE` in `app.js`.

## How the numbers are computed
The latest month where both the category and CPI-U have data is compared with the same calendar month in the chosen year. If that base month is missing, the page uses the nearest earlier month and says so. The difference is in percentage points. Contractor categories are Producer Price Indexes for nonresidential building work, labeled "producer prices" wherever they appear.

## S&P 500 vs. the cost of essentials
The section at `#sp` (script `sp.js`, data `data/sp-essentials.json`) shows the S&P 500, with dividends reinvested or price only, deflated three ways: by CPI-U all items, by an essentials index, and by the essentials index with FHFA home prices in place of CPI shelter. URL parameters: `sy` (start year), `sr` (`tr` or `px`).

- `tools/build_sp_essentials.py` rebuilds the JSON. Needs pandas, xlrd and openpyxl. Same contact rule as above: `PRICES_CONTACT_EMAIL` or `BLS_CONTACT`. `--offline` uses `tools/cache/`; `--if-older-than N` reuses cached files younger than N days.
- Sources: Robert Shiller's `ie_data.xls` (shillerdata.com), BLS CPI-U bulk files (SA0, SAF1, SAH1, SA0E, SAM), BLS relative importance December 2025, FHFA purchase-only monthly HPI (U.S., NSA).
- Essentials = food 13.698, shelter 35.625, energy 6.383, medical care 8.423 (December 2025 CPI-U relative importance), rescaled to sum to 1: 21.4%, 55.6%, 10.0%, 13.1%. Fixed basket (Laspeyres) anchored at December 2025: E(t) = 100 x sum of w_i x I_i(t) / I_i(Dec 2025).
- Total return: TR(t) = TR(t-1) x (P(t) + D(t)/12) / P(t-1), with Shiller's monthly average price P and trailing 12-month dividend D. Dividends not yet published are carried forward (at most 6 months; listed in `div_estimated`). Only rebased growth indexes are written, never raw prices.
- Checks before writing: real total return with Shiller's CPI must match his "Real Total Return Price" column within 0.5% from 1960-01 and 2000-09 (it matches to four digits); the essentials index must lie between its components; no missing months except gaps filled by geometric interpolation (October 2025, listed in `filled`).
- The daily data run calls the build with `--if-older-than 3`. A failure keeps the old JSON.
