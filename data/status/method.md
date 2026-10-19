# Collection status: method

This page reports on our own data collectors. It is rebuilt at the end of each daily collector run from the collectors' own run logs and output tables.

## What is shown
- **Campaigns**: each active scheduled collector. Disabled entries are not listed.
- **Last run**: when the collector last wrote to its run log (UTC). If a collector has no run log yet, the time of its newest collected data is used and the note says so.
- **Rows**: data rows across the campaign's cleaned tables: CSV and TSV rows without the header, JSON Lines records, JSON array items, Parquet and SQLite row counts. Raw snapshots, logs and caches are not counted. Derived tables count too, so totals overstate unique records.
- **Change**: rows now minus rows at the previous day's export. Shown from the second day of history.

## How health is decided
- **Fail**: the last run exited with a non-zero code (124 means it hit the 20-minute time limit), or the log ends in an error when no exit code was recorded.
- **Warn**: the last run is overdue (more than 36 hours ago for daily collectors, more than 10.5 days for weekly ones), the row count fell since the previous day, or a source blocked our requests on the latest run (collectors stop at once when that happens).
- **OK**: none of the above.

## Privacy
The file holds no file locations, account names or personal data. Campaign names are shown as they are; the page is public.
