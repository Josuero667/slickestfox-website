// GitHub OAuth bridge for Decap. Deploy this to a Worker, never GitHub Pages.
const COOKIE = '__Host-editor-oauth';
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const cookie = (value, age = 600) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };

function fail(message, status = 400) {
  return new Response(message, { status, headers: { ...headers, 'Set-Cookie': cookie('', 0) } });
}

function complete(origin, token) {
  const nonce = random();
  const safe = value => JSON.stringify(value).replaceAll('<', '\\u003c');
  const payload = 'authorization:github:success:' + JSON.stringify({ token, provider: 'github' });
  return new Response(`<!doctype html><meta charset="utf-8"><title>Signed in</title>
<p>Signed in. Returning to your editor…</p><script nonce="${nonce}">
const origin = ${safe(origin)};
function receive(event) {
  if (event.origin !== origin || event.source !== window.opener || event.data !== 'authorizing:github') return;
  window.removeEventListener('message', receive);
  window.opener.postMessage(${safe(payload)}, origin);
}
window.addEventListener('message', receive);
if (window.opener) window.opener.postMessage('authorizing:github', origin);
else document.querySelector('p').textContent = 'Open sign-in from your website editor.';
</script>`, { headers: {
    ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookie('', 0),
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`
  } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return fail('Method not allowed', 405);
    if (url.pathname === '/') return new Response('SlickestFox editor sign-in service', { headers });
    if (!['/auth', '/callback'].includes(url.pathname)) return fail('Not found', 404);
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SITE_ORIGIN || !env.ALLOWED_LOGIN || !env.GITHUB_REPO) {
      return fail('Sign-in has not been configured yet.', 503);
    }
    let site;
    try { site = new URL(env.SITE_ORIGIN); } catch { return fail('Invalid site configuration', 503); }
    if (site.protocol !== 'https:' || site.origin !== env.SITE_ORIGIN) return fail('Invalid site configuration', 503);
    const redirect = `${url.origin}/callback`;
    if (url.pathname === '/auth') {
      if (url.searchParams.get('provider') !== 'github' || url.searchParams.get('site_id') !== site.hostname) {
        return fail('This sign-in service is only for the configured website.');
      }
      const state = random();
      const verifier = random();
      const challenge = b64(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)));
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: redirect,
        scope: 'public_repo', state, code_challenge: challenge, code_challenge_method: 'S256' });
      const session = encodeURIComponent(JSON.stringify({ state, verifier, created: Date.now() }));
      return new Response(null, { status: 302, headers: {
        ...headers, Location: authorize.href, 'Set-Cookie': cookie(session)
      } });
    }
    let session;
    try {
      const stored = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`));
      session = JSON.parse(decodeURIComponent(stored.slice(COOKIE.length + 1)));
    } catch { return fail('Sign-in expired. Close this window and try again.'); }
    if (!session.state || url.searchParams.get('state') !== session.state ||
        typeof session.created !== 'number' || Date.now() - session.created > 600000 || session.created > Date.now() ||
        typeof session.verifier !== 'string' || session.verifier.length !== 43) {
      return fail('Sign-in could not be verified. Close this window and try again.');
    }
    if (url.searchParams.has('error') || !url.searchParams.get('code')) return fail('GitHub sign-in was cancelled.');
    try {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
          code: url.searchParams.get('code'), redirect_uri: redirect, code_verifier: session.verifier })
      });
      const result = await tokenResponse.json();
      if (!tokenResponse.ok || !result.access_token) return fail('GitHub did not complete sign-in. Please try again.', 502);
      const apiHeaders = { Authorization: `Bearer ${result.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'slickestfox-editor' };
      const userResponse = await fetch('https://api.github.com/user', { headers: apiHeaders });
      const user = await userResponse.json();
      if (!userResponse.ok || user.login?.toLowerCase() !== env.ALLOWED_LOGIN.toLowerCase()) {
        return fail('Only the website owner can use this editor.', 403);
      }
      const repoResponse = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}`, { headers: apiHeaders });
      const repo = await repoResponse.json();
      if (!repoResponse.ok || !repo.permissions?.push) return fail('Your account needs write access to the website repository.', 403);
      return complete(site.origin, result.access_token);
    } catch {
      return fail('GitHub is temporarily unavailable. Close this window and try again.', 502);
    }
  }
};
