# Activate the website editor

The public site stays on GitHub Pages. Cloudflare's Worker only handles the GitHub
sign-in exchange. You do not need to move the domain, change nameservers, add a
database, or subscribe to a paid plan for this small login service.

## 1. Create the Cloudflare Worker

In your Cloudflare account, open **Workers & Pages** and create a Worker named
`slickestfox-editor-auth`. Deploy the contents of `auth/worker.mjs`. Its address
will look like `https://slickestfox-editor-auth.YOUR-SUBDOMAIN.workers.dev`.

Alternatively, use the official Wrangler CLI from the `auth` directory:

```sh
npx wrangler login
npx wrangler deploy
```

The checked-in `wrangler.toml` contains the non-secret configuration. For dashboard
deployment, add these text variables under the Worker's Settings:

| Variable | Value |
| --- | --- |
| `SITE_ORIGIN` | `https://slickestfox.com` |
| `GITHUB_REPO` | `Josuero667/slickestfox-website` |
| `ALLOWED_LOGIN` | `Josuero667` |

Use the exact live site origin; `www` and non-`www` are different. Only this
origin can receive the login token, and only the configured GitHub user with
repository write access can complete sign-in.

## 2. Register a GitHub OAuth app

Open GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**.

- Application name: `SlickestFox Website Editor`
- Homepage URL: `https://slickestfox.com`
- Authorization callback URL: the exact Worker address followed by `/callback`

Copy the client ID and create the client secret. Save them as **encrypted secrets**
on the Cloudflare Worker: `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
Never put the secret in the website, this repository, screenshots or chat.
With Wrangler, enter the values interactively:

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

This uses GitHub's `public_repo` OAuth scope because the website is a public
repository. GitHub OAuth scopes are not limited to one repository: review that
scope when authorizing. The Worker checks the configured owner and repository,
but those checks do not reduce the scope of the resulting GitHub token.
Do not enable public registration or use a shared personal access token.

## 3. Connect the editor

In `admin/config.json`, set `backend.base_url` to the actual Worker origin,
without a trailing slash. Keep `auth_endpoint` as `auth`.

Until that value is set, the editor shows a setup message and does not attempt
to authenticate through an unrelated service.

## 4. Activate GitHub Pages publishing

Review the local changes before committing: this checkout also contains earlier
art, homepage and video edits. Push the intended website changes to `main`.
In the repository's **Settings → Pages → Build and deployment**, choose
**GitHub Actions** as the source. Keep the existing custom domain.

Run **Actions → Publish website → Run workflow**, or let the next push trigger it.
The workflow tests the build and login service, prepares `_site/`, then deploys
that artifact. It does not commit generated images back to the repository, so it
cannot create a commit loop. Pull requests build and test but never deploy.

## 5. Verify live

1. Open `https://slickestfox.com/admin/` and sign in as `Josuero667`.
2. Upload one image with a known file modification date and save it. Reopen the
   entry to confirm the date and year match the file.
3. Wait for the publishing workflow to finish; check the new artwork and preview.
4. Publish a commission status change, verify it, and restore your desired status.
5. Test a blog edit and confirm its formatting.

If publishing fails, the previous deployed website stays live. Read the failed
workflow step for the missing file or invalid field and correct it in the editor.
The site can be rolled back by reverting the content commit and rebuilding.

## References

- [Decap GitHub backend](https://decapcms.org/docs/github-backend/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
