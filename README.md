# SlickestFox website

Static website hosted on GitHub Pages, with a Decap editor at `/admin/`.

## Everyday updates

1. Open `https://slickestfox.com/admin/` and sign in with your GitHub account.
2. Choose **Artwork**, **Blog posts**, **Commission tiers**, **Music releases**, or **Site settings**.
3. Add or edit content and publish. GitHub builds previews and deploys the website.
4. Wait for **Publish website** in the repository's Actions tab to finish. A saved
   editor entry is committed content; it is not proof that deployment succeeded.

Artwork uploads capture the original browser File's last-modified timestamp.
Use **Upload multiple artworks** to select several images together. Each becomes
an entry at the top, with its filename (without extension) as the default title.
Batch uploads use unique storage names so duplicate filenames cannot overwrite
one another. Review the entries and click **Publish → Publish now**.
The date uses the uploader's local calendar date, and its year determines the
gallery tab. You can enable the date override for corrections. Dates are saved
in the manifest because Git does not preserve file modification times. Upload
through an artwork entry to capture its date; when choosing an existing media
library file without saved metadata, supply its date manually. Copying or exporting
a file can change its timestamp; the editor uses the timestamp your computer reports.

Leave color blank to calculate it during publishing. Choose manual, newest-date,
or color order in **Site settings**. Hidden items disappear from the website, but
this is not private storage: source files and history remain in the GitHub repository.
Posts use the site's existing bracket formatting, not Markdown.

Original artwork stays in GitHub. The public gallery gets 600px WebP previews and
up-to-2400px display images; animated originals retain animation in the large view.
Unrelated files in the image folders are never automatically added to the gallery.
Use PNG, JPEG, WebP, GIF or AVIF, with files below 40 MB. Give different artworks
different filenames when using the individual media-library uploader to avoid
replacing an existing upload.

**Commission tiers** edits the existing seven boxes: titles, prices, descriptions,
and gallery images. Add each gallery image once; the build repeats the scrolling
tracks automatically. Keep one image for the static emotes box. Descriptions
support line breaks and **bold** text. Layout and decorative frames stay intact.

**Music releases** edits the existing music manifest: cover, title, release year,
release link, pulse color, and tracks. Each track has a title, optional listening
link, uploaded audio preview (MP3/OGG/WAV), and BPM. New release IDs are generated
automatically. The existing music player handles playback and cover colors.

## One-time activation

See [editor setup](docs/editor-setup.md). The editor is implemented, but GitHub
sign-in remains disabled until a real authentication Worker URL is configured.
The code does not contain any OAuth client secret.

## Local verification

```sh
python -m pip install -r scripts/requirements.txt
python -m unittest discover -s tests
node --test auth/worker.test.mjs tests/editor.test.mjs
python scripts/build_site.py
python -m http.server 4173 --directory _site
```

Open `http://localhost:4173/`. The build only replaces `_site/`, leaves source
content untouched, and excludes scripts, credentials, tests and original art from
the website artifact. Do not upload the repository root as a Pages artifact.

For a disposable editor demonstration, open `/admin/?demo=1` on localhost.
This uses Decap's in-memory test backend, starts with empty content, and never
publishes to GitHub. Reloading discards its changes. Real GitHub sign-in should
be tested from the configured live site origin.

## Migration

The gallery was restored from the last committed local manifest: 116 artworks,
using the files' last-modified dates and existing colors. The two newer remote-only
entries (Lavenrite and Icon) were omitted as requested; upload your local copies
through the editor later. No external image account is required.

The previous offline editor and pre-migration manifest are backed up locally in
`.local-backups/`, which is excluded from Git and the published site.
