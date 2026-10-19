# Workbench

Small browser tools and public data: String Art Maker, Prices vs. Inflation and data dashboards (`data/`). Served at the domain in `CNAME`.

The site is static and served by GitHub Pages. It makes no third-party requests.

## Site name

The site files are edited directly. Only the header and footer blocks are generated (see Header and footer). The name appears in the home page heading, every page title, the top bar of every page, `og:site_name` and the JSON-LD. To rename the site, set `SITE_NAME` at the top of `build_v3.py` (kept outside this folder), run `python3 build_v3.py --write`, then `python3 site_nav.py` for the header and footer. Without `--write` it only lists what it would change. It replaces the name in those places only and never touches the domain, `CNAME`, `favicon.svg`, descriptions, nav or page content. In `string-art/` it changes only the title suffix, so update its `og:site_name` and JSON-LD publisher name by hand. The name drawn into `images/og-*.png` and the heading of this README must be updated by hand.

## Files

- `index.html`: the home page, a launcher: a grid of every tool and dashboard, each with its headline figure read from that dashboard's `data.json` (and, for Prices, the 12-month change in overall prices from `data/prices/data/prices.json`). The styles and that small script are inside the file.
- `string-art/`: String Art Maker, which turns a photo into string art in the browser. `worker.js` computes the nail order, `app.js` runs the page, and `sample-einstein.jpg` is the sample photo (Arthur Sasse, public domain). Photos are processed in the browser and never uploaded.
- `data/prices/`: Prices vs. Inflation, a dashboard (listed with the others under Data), which charts how much a category's price has changed since a chosen year next to overall prices (CPI-U). The data is official BLS price indexes in `data/prices/data/prices.json`, refreshed by hand with `data/prices/tools/refresh_data.py`; see `data/prices/README.md`. Do not publish `data/prices/tools/cache/` (about 21 MB of raw downloads). `prices/index.html` is only a redirect to `/data/prices/` for old links.
- `data/`: the data dashboards; see Data dashboards below.
- `404.html`: the page shown for addresses that do not exist.
- `images/`: the preview images on the home page, and the link-preview images `og-*.png` (1200 × 630), one per page.
- `sitemap.xml` and `robots.txt`: the page list for search engines. Add a line to `sitemap.xml` for each new page.
- `fonts/Inter-latin-var.woff2`: the Inter typeface, Latin characters only. Its license is in `fonts/LICENSE-Inter-OFL.txt` (SIL Open Font License 1.1).
- `site.css`: the shared shell styles: skip link, sticky header, sidebar (wide screens) or full menu (narrow screens), page switcher and footer.
- `site.js`: the shell's behaviour, under 5 KB, no libraries: the Menu button (focus kept inside while open, Esc closes) and the page switcher (Search pages, Ctrl K or Cmd K: type to filter, arrow keys, Enter).
- `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`: the site icon, a white W of straight strokes on an accent-blue square. The ICO (16, 32, 48 px) and the 180 px PNG are rendered from the SVG; every page links all three.
- `CNAME`: the domain GitHub Pages serves the site at.

## Header, sidebar and footer

Every page has the same shell. The sticky header has the site name linking home, a Search pages button (the page switcher, also Ctrl K or Cmd K) and, below 1024 px, a Menu button. The sidebar lists every page directly, in groups: Home; Tools (String Art, Prices vs. Inflation); Data (All dashboards, Housing, Economy, Markets, Collection status). The current page is in accent blue with a thin accent rule. On screens under 1024 px the same list opens full screen from Menu. The footer repeats every link. The HTML sits in each page between `<!-- nav:start -->` and `<!-- nav:end -->` (skip link, header and sidebar) and between `<!-- footer:start -->` and `<!-- footer:end -->`, so every link works without JavaScript (without it, the list shows under the header on small screens).

Do not edit those blocks by hand. Edit `GROUPS` in `site_nav.py` (kept outside this folder, next to `build_v3.py`), then run `python3 site_nav.py` to rewrite the blocks and set `aria-current` on each page's link: `"page"` on the page itself, `"true"` on the dashboard from its method page. It also adds the `/site.js` tag to a page that lacks it. `python3 site_nav.py --check` writes nothing and fails if any page has drifted, lacks the markers, does not link `site.css` or does not load `site.js`. A new page needs the two marker pairs, the `site.css` link, and an entry in `GROUPS` if it belongs in the menu. The page switcher lists the sidebar's pages plus each dashboard's method page.

## Data dashboards

- `data/index.html` lists the dashboards and Prices vs. Inflation, with the date each one's data refers to, read from its JSON.
- `data/housing/`, `data/economy/`, `data/markets/`, `data/status/`: one dashboard each. Every page is the same short HTML file; `data/dash.js` and `data/dash.css` fetch `data.json` from the page's folder and draw it: headline figures, two to four charts (line, bar, table, events, status) as inline SVG or tables, sources and notes. No third-party scripts.
- `data.json` is written by each area's export script, outside this folder, in the format in `SCHEMA.md` (also kept outside). Check a file with `python3 validate.py data.json` before publishing. Without a valid `data.json` the page says it is waiting for its first data export.
- `data/<area>/method/` shows `method.md` from that folder (headings, paragraphs, lists, links and bold), or a short note until it exists. Every dashboard and method page starts with area tabs (Housing, Economy, Markets, Status). Each method page links back to its dashboard at the top and the end; each dashboard ends with Previous, All dashboards and Next. The tabs and Previous/Next are written by `make_pages.py` (kept outside).

## Search and link previews

Each page's `<head>` has a title, description, canonical link, Open Graph and Twitter tags, and a JSON-LD block. Keep the title, `og:title` and `twitter:title` consistent, and the same for the descriptions.

## Domain

Full URLs (canonical links, Open Graph and Twitter tags, JSON-LD, `sitemap.xml`, `robots.txt`) all start with `https://addisonkopplin.com`. To change the domain, replace that string in every file and update `CNAME`.

## Editing

Edit the files and commit to `main`. GitHub Pages publishes the change within a few minutes.
