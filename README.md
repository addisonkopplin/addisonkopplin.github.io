# addisonkopplin.com

Source for [addisonkopplin.com](https://addisonkopplin.com), the projects site of Addison Kopplin.

The site is static and served by GitHub Pages. It has no build step and makes no third-party requests.

## Files

- `index.html`: the home page. It lists the projects and links to the shop. The styles are inside the file.
- `string-art/`: String Art Maker, a tool that turns a photo into string art in the browser. `worker.js` computes the nail order, `app.js` runs the page, and `sample-einstein.jpg` is the sample photo (Arthur Sasse, public domain). Photos are processed in the browser and never uploaded.
- `harmonograph/`: Harmonograph Maker, a tool that draws the curves traced by swinging pendulums. It exports SVG and PNG and stores the settings in the page address.
- `shop/`: the Custom String Art Guide storefront. Prices, delivery time and checkout links are set in the `SHOP` and `PAYMENT_LINKS` objects at the top of `shop/shop.js`. While a checkout link is empty, its button shows "Coming soon". The example images in `shop/examples/` were made with the String Art Maker.
- `404.html`: the page shown for addresses that do not exist.
- `images/string-art-einstein.jpg`: the image in the String Art Maker project entry.
- `fonts/Inter-latin-var.woff2`: the Inter typeface, Latin characters only. Its licence is in `fonts/LICENSE-Inter-OFL.txt` (SIL Open Font License 1.1).
- `favicon.svg`: the browser tab icon.
- `CNAME`: tells GitHub Pages to serve the site at addisonkopplin.com.

## Editing

Edit the files and commit to `main`. GitHub Pages publishes the change within a few minutes.
