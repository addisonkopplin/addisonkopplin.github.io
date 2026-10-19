# How the predictions are made and scored

## What this page is
The team turns the data it collects into forecasts that can be checked. Each forecast states a number, a range and a date. When the date passes, the outcome is looked up in a public source and the forecast is marked as a hit or a miss. Hits and misses both stay on the page.

These are paper predictions. No trades are placed and nothing here is investment advice.

## The ledger
- Every prediction goes into an append-only ledger when it is registered. Nothing in it is edited or deleted.
- Each entry gets a SHA-256 hash of its contents, and each hash is chained to the one before it. Changing, removing or reordering any entry breaks the chain, and the scripts refuse to run on a broken chain. The page shows the first 12 characters of each hash as its **lock**.
- An outcome is a separate entry that points to the prediction. A mistake is fixed by adding a new entry, never by rewriting an old one.
- Predictions imported from Ticker's earlier logs keep their original registration time. They also show the lock from that log (**source lock**), so they can be checked against it.

## How a model earns live predictions
1. **Backtest first.** A model is run through history in walk-forward order. At each date it is refit using only data that had been published by then, and it forecasts the next outcome. It never sees the outcome it is forecasting.
2. **Compare with a naive guess.** Each model is scored against a simple baseline: the last value repeated, or the historical average for probabilities. Skill = 1 − model error ÷ baseline error. Error is the mean absolute error, or the Brier score for probabilities.
3. **The rule, fixed before any results were seen:** a model is accepted only if its skill is above zero over the whole test period **and** in each half of it. A model that only wins in one era is rejected.
4. Only accepted models register live forecasts. Rejected models are listed with their numbers, because leaving them out would make the record look better than it is.

## Models tested so far (registered Oct 18, 2026)
- **Market volatility (accepted).** This model forecasts how much US stocks will swing over the next 21 trading days, from the last 21 days and the last six such periods. It was tested on US market daily returns from 1963 on (Kenneth R. French data library), with forecasts from 1980 to 2026. Its misses were 15% smaller than assuming no change, and it beat that guess in both halves. On S&P 500 closes from 2018 to 2026 its misses were 10% smaller. Its 80% ranges held 76% of the time.
- **Rent inflation (accepted).** This model forecasts the CPI rent index's change from a year earlier, six months ahead, from its current level and its change over the last six months. Tested 1990 to 2026, its misses were 22% smaller than assuming no change (10% and 28% in the two halves). Its 80% ranges held 72% of the time, so they are a little narrow.
- **Building permits → supplier revenue (rejected under this rule).** Ticker's model for POOL, SITE and WSO, rerun here from its locked input files, matches Ticker's reported errors. Pooled over 86 quarters, its misses were 16% larger than repeating last quarter's growth. Only WSO came out slightly better (4%). Its predictions for Q3 2026 were registered before this rule existed, so they stay open and will be scored. Their two benchmark forecasts are scored next to them.
- **Permits → housing starts next month (rejected).** Misses were 4% larger than assuming starts stay where they are.
- **Permits → housing starts over the next 3 months (rejected).** Misses were 13% larger than the last 3-month average.
- **Inverted yield curve → fewer jobs a year later (rejected).** It was worse than the historical base rate. The 2022–24 inversion was not followed by job losses.
- **Core inflation, 3-month average → next month (rejected).** It beat repeating last month in the first half of the test period (1990 to 2007) but not after. It also lost to a 12-month average.
- **Stocks above their 12-month average → gains next year (rejected).** It was slightly worse than the historical share of up years.

## Earlier predictions (Ticker, registered Oct 17, 2026)
- **Index events.** These forecast how Indonesian and Greek stock funds (EIDO, GREK) move against the emerging-market fund EEM around index-classification events. They rest on averages from a handful of past events (4 to 12), not on a backtested model. Scenario predictions count only if their condition happens; otherwise they are void.
- **Quarterly revenue.** These forecast POOL, SITE and WSO revenue growth for Q3 2026 from the permit model, scored against two benchmarks: repeating last quarter's growth, and no change from a year earlier.

## Scoring
- **Hit:** the outcome lands inside the stated range (80%, or 95% for the index events).
- **Calibration:** a well-calibrated set of 80% ranges should hold about 80% of the time. The track-record chart compares the running hit rate with that promise.
- **Sources for outcomes:** FRED for the S&P 500 closes and the CPI rent index, and SEC EDGAR filings for company revenue. The index events are scored by Ticker's event log from a permitted public price source.
- A daily job checks every open prediction whose date has passed. If the number is not published yet, the prediction stays open until it is.

## Market impact
Each prediction lists the markets it bears on and the direction the forecast implies. The size is given only where the model produces one. Price effects are marked "not estimated" unless a model estimates them.

## Known limits
- Backtests use today's revised data, not the figures first published. Real-time accuracy can be a little worse.
- The volatility model is fit on the whole US market and applied to the S&P 500. The two move almost identically, and the S&P check above is reported separately.
- The index-event estimates come from very small samples and have wide ranges.
- Data the team only started collecting in October 2026 (job postings, insider trades, search trends) is too short to backtest. Models built on it will be added once there is enough history.
