# Workbench

A collection of small browser tools and experiments: drawing tools (String Art, Harmonograph, Spirograph), data tools (Prices vs. Inflation), and a shop for custom string art guides. Served at the domain in `CNAME`.

The site is static and served by GitHub Pages. It makes no third-party requests.

## Site name

The site files are edited directly. Only the header and footer blocks are generated (see Header and footer). The name appears in the home page heading, every page title, the top bar of every page, `og:site_name` and the JSON-LD. To rename the site, set `SITE_NAME` at the top of `build_v3.py` (kept outside this folder), run `python3 build_v3.py --write`, then `python3 site_nav.py` for the header and footer. Without `--write` it only lists what it would change. It replaces the name in those places only and never touches the domain, `CNAME`, `favicon.svg`, descriptions, nav or page content. In `string-art/` it changes only the title suffix, so update its `og:site_name` and JSON-LD publisher name by hand. The name drawn into `images/og-*.png` and the heading of this README must be updated by hand.

## Files

- `index.html`: the home page. It lists the tools in two groups, Drawing and Data. The shop is linked from the footer. The styles are inside the file.
- `string-art/`: String Art Maker, which turns a photo into string art in the browser. `worker.js` computes the nail order, `app.js` runs the page, and `sample-einstein.jpg` is the sample photo (Arthur Sasse, public domain). Photos are processed in the browser and never uploaded.
- `harmonograph/`: Harmonograph Maker, which draws the curves traced by swinging pendulums. It exports SVG and PNG and stores the settings in the page address.
- `spirograph/`: Spirograph Maker, which draws hypotrochoids, epitrochoids and Lissajous figures. It exports SVG (one continuous path) and PNG and stores the settings in the page address.
- `prices/`: Prices vs. Inflation, which charts how much a category's price has changed since a chosen year next to overall prices (CPI-U). The data is official BLS price indexes in `prices/data/prices.json`, refreshed by hand with `prices/tools/refresh_data.py`; see `prices/README.md`. Do not publish `prices/tools/cache/` (about 21 MB of raw downloads).
- `shop/`: the Custom String Art Guide storefront. Prices, delivery time and checkout links are set in the `SHOP` and `PAYMENT_LINKS` objects at the top of `shop/shop.js`. While a checkout link is empty, its button shows "Coming soon". The example images in `shop/examples/` were made with the String Art Maker.
- `404.html`: the page shown for addresses that do not exist.
- `images/`: the preview images on the home page, and the link-preview images `og-*.png` (1200 × 630), one per page.
- `sitemap.xml` and `robots.txt`: the page list for search engines. Add a line to `sitemap.xml` for each new page.
- `fonts/Inter-latin-var.woff2`: the Inter typeface, Latin characters only. Its license is in `fonts/LICENSE-Inter-OFL.txt` (SIL Open Font License 1.1).
- `site.css`: the shared header, skip link and footer styles.
- `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`: the site icon, a white W of straight strokes on an accent-blue square. The ICO (16, 32, 48 px) and the 180 px PNG are rendered from the SVG; every page links all three.
- `CNAME`: the domain GitHub Pages serves the site at.

## Header and footer

Every page has the same top bar and footer. The top bar has the site name linking home, then String Art, Harmonograph, Spirograph and Prices. The footer repeats those links and adds Shop. The HTML sits in each page between `<!-- nav:start -->` and `<!-- nav:end -->` (skip link and header) and between `<!-- footer:start -->` and `<!-- footer:end -->`, so it works without JavaScript. The styles are in `site.css`, which every page links.

Do not edit those blocks by hand. Edit the template in `site_nav.py` (kept outside this folder, next to `build_v3.py`), then run `python3 site_nav.py` to rewrite the blocks and set `aria-current="page"` on each page's own link. `python3 site_nav.py --check` writes nothing and fails if any page has drifted, lacks the markers or does not link `site.css`. A new page needs the two marker pairs, the `site.css` link, and an entry in `LINKS` if it is a tool that belongs in the menu.

## Search and link previews

Each page's `<head>` has a title, description, canonical link, Open Graph and Twitter tags, and a JSON-LD block. Keep the title, `og:title` and `twitter:title` consistent, and the same for the descriptions. The shop's JSON-LD prices must match `SHOP` in `shop/shop.js`.

## Domain

Full URLs (canonical links, Open Graph and Twitter tags, JSON-LD, `sitemap.xml`, `robots.txt`) all start with `https://addisonkopplin.com`. To change the domain, replace that string in every file and update `CNAME`.

## Editing

Edit the files and commit to `main`. GitHub Pages publishes the change within a few minutes.
