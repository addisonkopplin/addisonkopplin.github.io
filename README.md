# addisonkopplin.com

Source for [addisonkopplin.com](https://addisonkopplin.com), the resume of Addison Kopplin.

The site is static and served by GitHub Pages. It has no build step and makes no third-party requests.

## Files

- `index.html`: the resume page. The styles are inside the file. It has no JavaScript.
- `string-art/`: String Art Maker, a tool that turns a photo into string art in the browser. `worker.js` computes the nail order, `app.js` runs the page, and `sample-einstein.jpg` is the sample photo (Arthur Sasse, public domain). Photos are processed in the browser and never uploaded.
- `404.html`: the page shown for addresses that do not exist.
- `Addison_Kopplin_Resume.pdf`: the resume as a one-page PDF.
- `images/string-art-einstein.jpg`: the image in the string art project entry.
- `fonts/Inter-latin-var.woff2`: the Inter typeface, Latin characters only. Its licence is in `fonts/LICENSE-Inter-OFL.txt` (SIL Open Font License 1.1).
- `favicon.svg`: the browser tab icon.
- `CNAME`: tells GitHub Pages to serve the site at addisonkopplin.com.

## Editing

Edit `index.html` and commit to `main`. GitHub Pages publishes the change within a few minutes.
