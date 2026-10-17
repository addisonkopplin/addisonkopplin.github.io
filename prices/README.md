# Prices vs. Inflation

A static page that compares how much a category's price has changed since a chosen year with the change in overall prices (CPI-U, all items). It runs in the browser with vanilla JS, makes no API calls at runtime and loads nothing from third parties. The only data it fetches is `data/prices.json`, served with the page.

## Files
- `index.html`, `app.css`, `app.js`: the page. The structure, nav and styles follow `/harmonograph/`.
- `data/prices.json`: monthly, not seasonally adjusted BLS index values from January 2000. Each series has `id`, `label`, `group`, `kind` (`cpi` or `ppi`), official `title`, `first`/`last` month, `gaps` (months BLS did not publish, e.g. 2025-10 because of the shutdown), `prelim` (preliminary PPI months) and `v` (one value per month from `start`, `null` where missing).
- `tools/refresh_data.py`: rebuilds the JSON from the BLS bulk flat files (keyless). It uses the standard library only.

## Updating the data
CPI comes out mid-month for the previous month. To update:

    BLS_CONTACT=you@example.com python3 tools/refresh_data.py

BLS rejects downloads (HTTP 403) unless the User-Agent includes a contact email. The script builds one from `BLS_CONTACT`. Downloads are cached in `tools/cache/` (about 21 MB; do not publish it). `--offline` rebuilds from the cache. To add or remove a category, edit `SERIES` in the script. To change how it reads in the summary sentence, edit `PHRASE` in `app.js`.

## How the numbers are computed
The latest month where both the category and CPI-U have data is compared with the same calendar month in the chosen year. If that base month is missing, the page uses the nearest earlier month and says so. The difference is in percentage points. Contractor categories are Producer Price Indexes for nonresidential building work, labeled "producer prices" everywhere they appear.

## Site integration
"Prices" is in the shared nav on every page (home, String Art Maker, Harmonograph, Spirograph, Shop and this page), and `prices/` is listed in the site README. Because the nav is written out in each page's HTML, any nav change has to be made in all of them. The share image is `/images/og-prices.png`.
