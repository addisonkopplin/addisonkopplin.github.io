# String & Pendulum

Free browser tools for making line art from thread and pendulums, plus a shop for custom string art guides. Served at the domain in `CNAME`.

The site is static and served by GitHub Pages. It makes no third-party requests.

## Site name

The name appears in the home page heading, every page title, and the top bar of every page. It is set once, in `SITE_NAME` at the top of `build_v3.py` (kept outside this folder). Change it there and re-run the script. The script rewrites `index.html`, `404.html` and `favicon.svg`, and replaces only the top-bar name and the title suffix in the tool and shop pages.

## Files

- `index.html`: the home page. It lists the tools and links to the shop. The styles are inside the file.
- `string-art/`: String Art Maker, which turns a photo into string art in the browser. `worker.js` computes the nail order, `app.js` runs the page, and `sample-einstein.jpg` is the sample photo (Arthur Sasse, public domain). Photos are processed in the browser and never uploaded.
- `harmonograph/`: Harmonograph Maker, which draws the curves traced by swinging pendulums. It exports SVG and PNG and stores the settings in the page address.
- `shop/`: the Custom String Art Guide storefront. Prices, delivery time and checkout links are set in the `SHOP` and `PAYMENT_LINKS` objects at the top of `shop/shop.js`. While a checkout link is empty, its button shows "Coming soon". The example images in `shop/examples/` were made with the String Art Maker.
- `404.html`: the page shown for addresses that do not exist.
- `images/`: the preview images on the home page.
- `fonts/Inter-latin-var.woff2`: the Inter typeface, Latin characters only. Its licence is in `fonts/LICENSE-Inter-OFL.txt` (SIL Open Font License 1.1).
- `favicon.svg`: the browser tab icon, a circle of nails with thread across it.
- `CNAME`: the domain GitHub Pages serves the site at.

## Editing

Edit the files and commit to `main`. GitHub Pages publishes the change within a few minutes.
