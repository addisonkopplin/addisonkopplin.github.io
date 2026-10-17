# String & Pendulum

Free browser tools for making line art from thread and pendulums, a chart of prices against inflation, and a shop for custom string art guides. Served at the domain in `CNAME`.

The site is static and served by GitHub Pages. It makes no third-party requests.

## Site name

The site files are edited directly; no script generates or overwrites them. The name appears in the home page heading, every page title, the top bar of every page, `og:site_name` and the JSON-LD. To rename the site, set `SITE_NAME` at the top of `build_v3.py` (kept outside this folder) and run `python3 build_v3.py --write`. Without `--write` it only lists what it would change. It replaces the name in those places only and never touches the domain, `CNAME`, `favicon.svg`, descriptions, nav or page content. In `string-art/` it changes only the top-bar name and the title suffix. The name drawn into `images/og-*.png` and the heading of this README must be updated by hand.

## Files

- `index.html`: the home page. It lists the tools and links to the shop. The styles are inside the file.
- `string-art/`: String Art Maker, which turns a photo into string art in the browser. `worker.js` computes the nail order, `app.js` runs the page, and `sample-einstein.jpg` is the sample photo (Arthur Sasse, public domain). Photos are processed in the browser and never uploaded.
- `harmonograph/`: Harmonograph Maker, which draws the curves traced by swinging pendulums. It exports SVG and PNG and stores the settings in the page address.
- `spirograph/`: Spirograph Maker, which draws hypotrochoids, epitrochoids and Lissajous figures. It exports SVG (one continuous path) and PNG and stores the settings in the page address.
- `prices/`: Prices vs. Inflation, which charts how much a category's price has changed since a chosen year next to overall prices (CPI-U). The data is official BLS price indexes in `prices/data/prices.json`, refreshed by hand with `prices/tools/refresh_data.py`; see `prices/README.md`. Do not publish `prices/tools/cache/` (about 21 MB of raw downloads).
- `shop/`: the Custom String Art Guide storefront. Prices, delivery time and checkout links are set in the `SHOP` and `PAYMENT_LINKS` objects at the top of `shop/shop.js`. While a checkout link is empty, its button shows "Coming soon". The example images in `shop/examples/` were made with the String Art Maker.
- `404.html`: the page shown for addresses that do not exist.
- `images/`: the preview images on the home page, and the link-preview images `og-*.png` (1200 × 630), one per page.
- `sitemap.xml` and `robots.txt`: the page list for search engines. Add a line to `sitemap.xml` for each new page.
- `fonts/Inter-latin-var.woff2`: the Inter typeface, Latin characters only. Its license is in `fonts/LICENSE-Inter-OFL.txt` (SIL Open Font License 1.1).
- `favicon.svg`: the browser tab icon, a circle of nails with thread across it.
- `CNAME`: the domain GitHub Pages serves the site at.

## Search and link previews

Each page's `<head>` has a title, description, canonical link, Open Graph and Twitter tags, and a JSON-LD block. Keep the title, `og:title` and `twitter:title` consistent, and the same for the descriptions. The shop's JSON-LD prices must match `SHOP` in `shop/shop.js`.

## Domain

Full URLs (canonical links, Open Graph and Twitter tags, JSON-LD, `sitemap.xml`, `robots.txt`) all start with `https://addisonkopplin.com`. To change the domain, replace that string in every file and update `CNAME`.

## Editing

Edit the files and commit to `main`. GitHub Pages publishes the change within a few minutes.
