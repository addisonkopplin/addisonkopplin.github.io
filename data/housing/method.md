# Housing dashboard: method notes

This page explains how the figures on the Housing dashboard are made. It is updated daily. Every figure comes from official open data or from our own calculations on that data. We do not republish values from Zillow, Redfin or the NAIC (see **What we leave out**).

## Cost of owning vs renting
- **What it measures.** The yearly cost of owning a typical home, divided by the yearly rent on a typical rental. Above 1 means owning costs more.
- **Cost of owning.** It is the total of these yearly items, each as a share of the home's value:
  - mortgage interest, at the Freddie Mac 30-year rate, which also stands in for the return given up on the down payment
  - property tax: Census ACS median tax divided by median value
  - upkeep and depreciation: 2.5%
  - homeowners insurance: the U.S. Treasury Federal Insurance Office (FIO) 2022 average premium per policy, weighted by owner homes and aged to today with the BLS producer price index for homeowners insurance
  - flood insurance: FEMA NFIP spending per residential structure
  - **minus** the price growth an owner can expect: 10-year breakeven inflation from Treasury yields, plus 1.75% a year of real growth, which is the median metro's 1997–2024 FHFA real price growth
- **Risk premium.** We show two versions:
  - **With a 2% risk premium.** This adds an extra 2% of value a year for carrying the risk that a leveraged house falls in price. It is the standard Himmelberg-Mayer-Sinai setting.
  - **With no risk premium.** Cash and opportunity costs only.
  - The answer depends heavily on this choice, which is why both are shown.
- **Prices.** We start from the Census ACS 2024 median home value and move it forward and back in time with the FHFA House Price Index:
  - for the US, the purchase-only monthly index, seasonally adjusted
  - for metros, the all-transactions quarterly index
- **Rents.** We start from the Census ACS 2024 median gross rent and move it with the BLS CPI rent of primary residence (U.S. city average). These rents cover all renters, including long-time tenants, and include utilities. Levels therefore differ from listing-rent measures. Trends over time and rankings across metros are the more robust part.
- **Uncertainty.** Ranges are the 10th to 90th percentiles of 2,000 draws. Each draw varies:
  - upkeep: 1.5–3.5%
  - the share of interest and tax that is tax-deductible: 0–15%
  - the homeowners premium: ×0.8–1.25
  - flood cost: ×0.5–2
  - for metros, also the weight on the metro's own long-run price growth (0–1) and the sampling error of the ACS median value
  - The headline figure assumes no tax deduction, so it can sit at or above the top of its range.
- **Rank band and confidence.**
  - The rank band is the 10th to 90th percentile of each metro's rank across the draws.
  - Confidence is **High** if the band spans 20 places or fewer and insurance data cover at least 80% of owner homes. It is **Medium** if the band spans 50 or fewer, and **Low** otherwise.
  - Connecticut metros are always Low because of the 2022 county change.
- **Baseline.** The 2015–19 average uses each month's mortgage rate, breakeven inflation, price index, rent index and the insurance cost deflated to that month.

## Price to income
- **Headline, state and county maps.** All use the same survey basis: median home value ÷ median household income from the ACS (U.S. and states: 1-year 2024; counties: 5-year 2020–24). The headline is therefore directly comparable with the state values.
- **Nowcast (note only).** Moving the 2024 value forward with the FHFA index, and income with the 2024–25 growth of average pay in the BLS QCEW, gives a lower current figure. It is reported in a note with its month, not as the headline.

## Housing surplus or shortfall since 2010
- **Sign.** Published values count a shortfall as positive and a surplus as negative, in the headline, chart, maps, ranges and findings.
- **Formula.** For each year since 2010 the balance is:
  - the vacant homes in 2010 above a normal vacancy rate (6.6%), **plus**
  - homes completed since 2010 (Census New Residential Construction), **minus**
  - homes lost at 0.1% of the stock a year, **minus**
  - homes needed for household growth, i.e. household growth ÷ (1 − 6.6%).
- **Households.** Household growth from 2010 to 2024 is the ACS change. The year-to-year path follows the Census Housing Vacancy Survey, scaled to match the ACS change. 2025 extends the survey path, and October 2025 had no survey release.
- **Range.** The other lines use a loss rate of 0% and 0.25% a year, and normal vacancy ±2 points.

## New homes permitted (city permit feeds)
- **What it counts.** Units in new residential buildings with a permit issued each month, from the cities' own open-data permit feeds: Seattle, Austin, San Francisco and Los Angeles.
- **Checks.**
  - The feeds are checked against the Census Building Permits Survey. Annual correlations are 0.95–1.00, and monthly correlations 0.78–0.98.
  - New York City is collected but left out because its feed does not match Census counts.
- **Lag.** The latest month shown is two months before the run date, because cities keep adding late entries.
- **Personal data.** Permit records are counted by city and month only. No names, addresses or parcel IDs are kept.

## Maps, state filter and heat maps (states.json, counties/*.json)
- **Keys.** States use 2-digit FIPS and counties 5-digit FIPS, matching Census TIGER cartographic boundary GEOIDs. Connecticut uses its 9 planning regions (09110–09190), as Census has since 2022. Puerto Rico and the island areas are not included.
- **Survey values.** State maps use the ACS 1-year 2024. County maps use the ACS 5-year 2020–2024, in 2024 dollars, because the 1-year survey covers only areas with 65,000+ people. The two are not directly comparable. Each metric gives its vintage in its `source` and `as_of`.
- **Owning vs renting, 2025.** This uses the same user-cost formula as the national chart, with local inputs:
  - Value moved to the 2025 average with FHFA's state index (counties: FHFA's annual county index, or the state index where flagged).
  - Rent moved with BLS CPI rent for the Census region.
  - Property-tax rate = median real-estate taxes ÷ median value.
  - Treasury FIO homeowners premium (county, or state average where flagged), aged from 2022 with the BLS insurance price index.
  - FEMA flood premiums per residential structure.
  - 2025 average mortgage rate and breakeven inflation.
  - County 5-year medians are first converted from 2024 dollars to a 2020–24 nominal level using the local price index and CPI-U, then moved to 2025.
  - States get a 10th–90th percentile range from 2,000 random draws; counties do not.
- **Insurance share.** `ins_pct_value` = (homeowners + flood) ÷ value. `ins_share_gross_cost_pct` = (homeowners + flood) ÷ (interest + property tax + 2.5% upkeep + homeowners + flood), with no risk premium and no appreciation offset.
- **Permits per 1,000.**
  - Census Building Permits Survey: county annual totals (states = sum of counties) and the 2026 year-to-date file. Divided by Census population estimates.
  - The 2015–19 baseline uses the 2015–19 averages. It is blank for Connecticut planning regions, because permits then were reported by the old counties.
  - The monthly state series uses the Census monthly state files (imputed estimates, not seasonally adjusted).
- **Surplus or shortfall since 2010.**
  - **States** use exactly the national method: ACS 1-year 2010 to 2024, permits 2010–23 × 0.924 completions per permit, 0.1% yearly losses, and a 6.58% normal vacancy. State totals add up to the national figure within 0.2%.
  - **Counties** start from the 2010 Census, put on the ACS basis with U.S. ratios, and end at the ACS 5-year 2020–24 (about 2022). Permits run 2010–21 with 12 years of losses.
  - County and state results are therefore not the same period.
  - County shortfall is left blank when the county has fewer than 10,000 households, or when the estimate is smaller than the ACS margin of error for households ÷ (1 − 6.58%). These are small-count and survey-margin problems, not model choices.
  - Where the low–high range (losses 0–0.25% a year, vacancy target ±2 points) crosses zero, the value is shown but flagged: "sign depends on loss and vacancy assumptions".
  - The county method reads high vacancy in 2010 as surplus. This matters most in second-home and high-vacancy states such as Florida, where county totals sit well above the state estimate.
- **5-year price change.** FHFA all-transactions index: latest quarter vs the same quarter five years earlier for the U.S., states and metros; 2025 vs 2020 for counties (annual county index).
- **Heat maps (state × year).**
  - **Price to income, 2000–2025.** ACS 2024 value and income moved back with each state's FHFA index and BEA per-capita personal income.
  - **Owning vs renting, 2003–2026.** It starts in 2003 because Treasury's inflation-protected yield curve (needed for expected inflation) starts then. 2026 is a partial year.
  - **Two anchors.** Before adjustment, the back-cast misses the ACS 2010 values by a median of about 7–8%. The gap is closed gradually: series match the ACS exactly in 2010 and 2024, and years before 2010 keep the 2010 adjustment. The property-tax rate is held at its 2024 level.
  - Apart from 2010 and 2024, every year is an index-based estimate, not a survey value.
- **Findings.** Up to three per state, picked by fixed rules. Each is one sentence under 120 characters that states only its own numbers:
  - The county most above its 2015–19 owning-vs-renting ratio (25,000+ residents, county price index, no high-error flag).
  - The fastest growth in permits per 1,000 residents vs 2015–19 (10,000+ residents and at least 1 per 1,000 in 2015–19).
  - The largest shortfall per 1,000 residents among counties with a shown value whose range does not cross zero.
  - When no county qualifies (e.g. DC, or Connecticut for surplus), the state value is shown.

## What we leave out
- **Zillow home values and rents (ZHVI, ZORI).** Our internal research uses them. Zillow's terms limit use to its stated audiences and bar using its services "to develop competitive products or services", so we use the public-data version above.
- **Redfin data.** Redfin's terms grant a "personal, non-commercial" license.
- **NAIC insurance averages.** The NAIC report states "No part of this book may be reproduced … without written permission". We use the Treasury FIO premiums instead.

## Sources and terms
- **Federal sources.** FHFA (including the developmental county index), Census Bureau (ACS, 2010 Census, building permits, population estimates), BLS, BEA, Treasury and FIO data are public domain (U.S. government works); attribution is requested. This product uses FHFA data but is neither endorsed nor certified by FHFA.
- **Freddie Mac PMMS.** Used with attribution and values unaltered.
- **FEMA.** This product uses the Federal Emergency Management Agency's OpenFEMA API, but is not endorsed by FEMA. The Federal Government or FEMA cannot vouch for the data or analyses derived from these data after the data have been retrieved from the Agency's website(s). Datasets used:
  - NfipPolicies v3, retrieved 2026-10-17
  - NfipResidentialPenetrationRates v1, retrieved 2026-10-17
- **City permit data.**
  - Seattle (public domain; City of Seattle, SDCI)
  - Austin (public domain)
  - San Francisco (ODC PDDL)
  - Los Angeles (City of LA open data terms)
