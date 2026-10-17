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
