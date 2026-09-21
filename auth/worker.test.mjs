import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const env = { GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret',
  SITE_ORIGIN: 'https://slickestfox.com', GITHUB_REPO: 'Josuero667/slickestfox-website', ALLOWED_LOGIN: 'Josuero667' };
const origin = 'https://editor.example.workers.dev';
const start = () => worker.fetch(new Request(`${origin}/auth?provider=github&site_id=slickestfox.com`), env);
async function callback(cookieTransform = value => value, stateOverride) {
  const response = await start();
  const state = new URL(response.headers.get('Location')).searchParams.get('state');
  return worker.fetch(new Request(`${origin}/callback?code=test-code&state=${stateOverride ?? state}`, {
    headers: { Cookie: cookieTransform(response.headers.get('Set-Cookie').split(';')[0]) }
  }), env);
}

test('sign-in binds a secure cookie to state and uses PKCE with public-repository scope', async () => {
  const response = await start();
  assert.equal(response.status, 302);
  const target = new URL(response.headers.get('Location'));
  assert.equal(target.origin, 'https://github.com');
  assert.equal(target.searchParams.get('scope'), 'public_repo');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(target.searchParams.get('code_challenge').length, 43);
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('foreign sites and unconfigured services cannot sign in', async () => {
  assert.equal((await worker.fetch(new Request(`${origin}/auth?provider=github&site_id=evil.example`), env)).status, 400);
  assert.equal((await worker.fetch(new Request(`${origin}/auth`), {})).status, 503);
});

test('rejects missing, mismatched and expired state before contacting GitHub', async () => {
  assert.equal((await worker.fetch(new Request(`${origin}/callback?code=x&state=y`), env)).status, 400);
  assert.equal((await callback(value => value, 'wrong')).status, 400);
  assert.equal((await callback(value => {
    const split = value.indexOf('=');
    const stored = JSON.parse(decodeURIComponent(value.slice(split + 1)));
    stored.created -= 700000;
    return value.slice(0, split + 1) + encodeURIComponent(JSON.stringify(stored));
  })).status, 400);
});

test('only owner with repository write access receives a token at the exact site origin', async t => {
  let login = 'somebody-else';
  let push = true;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/access_token')) {
      assert.equal(JSON.parse(options.body).code_verifier.length, 43);
      return Response.json({ access_token: 'mock-token' });
    }
    if (url.endsWith('/user')) return Response.json({ login });
    return Response.json({ permissions: { push } });
  });
  assert.equal((await callback()).status, 403);
  login = 'Josuero667';
  push = false;
  assert.equal((await callback()).status, 403);
  push = true;
  const response = await callback();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /https:\/\/slickestfox.com/);
  assert.match(html, /event.source !== window.opener/);
  assert.match(html, /authorization:github:success:/);
  assert.doesNotMatch(html, /postMessage\([^\n]+['"]\*['"]/);
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
});

test('upstream errors fail without disclosing credentials', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error(env.GITHUB_CLIENT_SECRET); });
  const response = await callback();
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /test-secret/);
});
