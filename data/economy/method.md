# Economy dashboard: method

This page explains the numbers on the Economy dashboard: trade and contractor prices, new trade businesses, advertised home-service prices and contractor spending. The file is rebuilt daily, and each source updates on its own schedule.

## Trade prices vs overall prices
- **Source:** U.S. Bureau of Labor Statistics, Consumer Price Index (CPI-U, U.S. city average) and Producer Price Index by industry. All series are not seasonally adjusted.
- **Series:** dashboard label, series ID and official BLS title:
  - Overall prices: CUUR0000SA0 (BLS title: All items (CPI))
  - Auto repair: CUUR0000SETD (BLS title: Motor vehicle maintenance and repair (CPI))
  - Auto body work: CUUR0000SETD01 (BLS title: Motor vehicle body work (CPI))
  - Auto maintenance and servicing: CUUR0000SETD02 (BLS title: Motor vehicle maintenance and servicing (CPI))
  - Auto repair work only: CUUR0000SETD03 (BLS title: Motor vehicle repair (CPI))
  - Car insurance: CUUR0000SETE (BLS title: Motor vehicle insurance (CPI))
  - Electricity: CUUR0000SEHF01 (BLS title: Electricity (CPI))
  - Natural gas (piped): CUUR0000SEHF02 (BLS title: Utility (piped) gas service (CPI))
  - Water, sewer and trash: CUUR0000SEHG (BLS title: Water and sewer and trash collection services (CPI))
  - Electrical work (producer prices): PCU23821X23821X (BLS title: Electrical contractors, nonresidential building work (PPI))
  - Plumbing and HVAC work (producer prices): PCU23822X23822X (BLS title: Plumbing, heating and air-conditioning contractors, nonresidential building work (PPI))
  - Roofing work (producer prices): PCU23816X23816X (BLS title: Roofing contractors, nonresidential building work (PPI))
  - Building maintenance and repair (producer prices): PCU2381MR2381MR (BLS title: Nonresidential building maintenance & repair (PPI))
- **Labels:** we use the same plain labels as our Prices page.
  - "Auto repair" is the BLS motor vehicle maintenance and repair index.
  - "Auto repair work only" is its repair-only part, excluding body work and routine servicing. It has risen faster than the overall index.
- **"Change since 2019"** is the latest month against the 2019 annual average. **"Past year"** is the latest month against the same month a year earlier. **"vs CPI"** is the difference in percentage points from overall prices (all items) over the same span.
- **Caveat:** producer prices for contractors cover *nonresidential* building work. They are the closest official measure but do not price home service calls.
- **Downloads:** https://download.bls.gov/pub/time.series/cu/ and https://download.bls.gov/pub/time.series/pc/

## New trade businesses
- **Sources:**
  - Colorado Secretary of State business entities (data.colorado.gov, dataset 4ykn-tg5h; public domain).
  - New York Department of State, Corporations and Other Entities (data.ny.gov, dataset 63wc-4exh; Open NY terms of use).
- **Method:**
  - We count new for-profit entity filings by month.
  - We classify trades (plumbing, HVAC, electrical, roofing) by words in the entity name. Names miss firms with generic names, so read the series as a trend, not a count.
  - The chart shows trailing 12-month totals indexed to 2019 = 100, through 2026-08.
  - The latest two months are left out because filings are recorded with a lag.
- **Validation:** monthly totals track the Census Bureau's Business Formation Statistics (business applications). Level correlation since 2016 is 0.85 for Colorado and 0.90 for New York.

## Advertised home-service prices
- **Source:** our own aggregate of fixed prices advertised on the public offer pages of locations of three national franchise service chains (HVAC, plumbing, electrical). The latest snapshot is 2026-10-19.
- **What is published:** only medians and 10th/90th percentiles across locations, by service, and only where at least 5 locations advertise a fixed price.
  - Rows with fewer than 10 locations are marked "small sample".
  - We publish no individual locations, brands, page text or per-location prices.
  - Discount offers are excluded.
- **Caveats:**
  - Samples are small.
  - Advertised introductory prices are not the typical invoice.
  - Franchise locations over-represent suburban and Sun Belt metros.

## Contractor spending
- **Source:** U.S. Census Bureau, 2017 and 2022 Economic Census, construction sector (NAICS 238220, plumbing, heating and air-conditioning contractors). Each bar is the 2022 share of revenue minus the 2017 share, in percentage points.
- **Firm size:** U.S. Census Bureau, Statistics of U.S. Businesses 2017 and 2022. This is the share of employment in firms with 500 or more employees.
- **Timing:** the Economic Census runs every five years, so these figures change only when a new census is released.

## Licenses
- Federal data (BLS, Census) is public domain.
- State registry data is used under each portal's terms (Colorado: public domain; New York: Open NY terms of use).
- Advertised-price figures are our own derived aggregates.
