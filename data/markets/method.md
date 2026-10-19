# Markets: method notes

**Valuation.** CAPE is Robert Shiller's cyclically adjusted price-to-earnings ratio for the S&P composite: real price divided by the 10-year average of real earnings. It uses his publicly posted monthly data, which carries attribution but no explicit license. The chart shows yearly averages, with the latest month standing in for the current year. The 10th and 90th percentile lines are computed over all months since 1881. The earnings-yield gap is 1/CAPE minus the 10-year TIPS real yield (Federal Reserve, via FRED).

**Company margins (SEC filings).** We take every company that files XBRL with the SEC and rank them each year by the public float on its cover page. The 500 largest form the group.
- *Margins* = summed net income (or operating income) divided by summed revenue for the non-financial members. Financials are SIC codes 6000-6799.
- Calendar-year values come from the SEC's XBRL "frames", which align fiscal years to the nearest calendar year.

**Concentration, breadth and returns (derived from third-party prices).** These come from an internal, one-time snapshot of daily stock, fund and country-index prices. We publish only figures computed from it, never the prices themselves.
- *Top-10 share* = the market value of the 10 largest current S&P 500 members as a share of all current members. Market value is the month-end price times the shares outstanding in each company's latest filing at that date.
- *Breadth* = the share of current members whose price is above its 200-day average, at month end.
- Both use today's members, so earlier years leave out companies that later dropped out of the index (survivorship bias).
- *Frontier P/E* = the median trailing price-to-earnings ratio across frontier-market country indexes at 30 September 2026. The note gives the emerging-market median for comparison.
- *12-month returns* for frontier and emerging economies are country-index total returns in US dollars.
- The snapshot is not refreshed, so these figures stay at their mid-October 2026 values.

**Frontier and emerging macro.**
- Real rate = BIS central-bank policy rate (where the BIS does not cover a country: the IMF T-bill or discount rate, flagged) minus the latest year-on-year CPI inflation from the IMF.
- Reserves in months of imports come from the World Bank.
- The current account is the IMF World Economic Outlook figure for 2026, which is a forecast.
- The credit gap is the BIS credit-to-GDP gap.

**Predictions.** These are paper predictions only: no trades and no accounts. Each one is written before its event and locked with a SHA-256 hash of the row, chained to the previous row, in an append-only log.
- Index-event predictions are scored after the window closes, as returns relative to an emerging-market benchmark using a market model.
- Quarterly-revenue predictions are scored against the revenue in the company's 10-Q (SEC XBRL), next to a naive placebo forecast.
- An outcome stays empty until it is scored.

**What is not here.** No raw price series, index levels, dollar values or lists of index members are published. Sector price-to-earnings ratios are left out because of the four-chart limit.
