/**
 * Slidewright sign-in relay (Cloudflare Worker).
 *
 * GitHub's OAuth flow needs a server to swap the one-time code for a token,
 * because that step uses the app's client secret and GitHub doesn't allow it
 * from a web page. This worker does only that, and keeps nothing.
 *
 * Settings (Worker → Settings → Variables and Secrets):
 *   GITHUB_CLIENT_ID      the OAuth app's Client ID            (text)
 *   GITHUB_CLIENT_SECRET  the OAuth app's Client secret        (secret)
 *   ALLOWED_ORIGINS       comma-separated sites allowed to sign in,
 *                         e.g. https://www.jessetnroberts.com,https://jessetnroberts.com  (text)
 *   SCOPE                 optional; "repo" (default) or "public_repo"
 */
// UTF-8 safe: btoa() alone throws on characters such as ’, which crashed the relay (Cloudflare error 1101).
const b64url = s => { let b = ''; new TextEncoder().encode(s).forEach(c => { b += String.fromCharCode(c); }); return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))); };
const text = (msg, status = 200) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (e) { return text('The Slidewright sign-in relay hit an error: ' + (e && e.message || e), 500); }
  }
};

async function handle(req, env) {
  {
    const url = new URL(req.url);
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const okReturn = r => { try { const u = new URL(r); const local = u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
      return (u.protocol === 'https:' || local) && allowed.includes(u.origin) ? u : null; } catch { return null; } };

    if (url.pathname === '/login') {
      const ret = okReturn(url.searchParams.get('return') || '');
      const nonce = url.searchParams.get('nonce') || '';
      if (!ret) return text('This site is not allowed to sign in through this relay.', 403);
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return text('Bad sign-in request.', 400);
      if (!env.GITHUB_CLIENT_ID) return text('The relay is missing GITHUB_CLIENT_ID.', 500);
      const gh = new URL('https://github.com/login/oauth/authorize');
      gh.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      gh.searchParams.set('redirect_uri', url.origin + '/callback');
      gh.searchParams.set('scope', env.SCOPE || 'repo');
      gh.searchParams.set('state', b64url(JSON.stringify({ r: ret.href, n: nonce })));
      gh.searchParams.set('allow_signup', 'false');
      return Response.redirect(gh.toString(), 302);
    }

    if (url.pathname === '/callback') {
      let st; try { st = JSON.parse(unb64url(url.searchParams.get('state') || '')); } catch { return text('Bad sign-in state.', 400); }
      const ret = okReturn(st.r || ''); if (!ret) return text('This site is not allowed to sign in through this relay.', 403);
      const back = data => { ret.hash = 'sw_auth=' + b64url(JSON.stringify(Object.assign({ nonce: st.n }, data))); return new Response(null, { status: 302, headers: { location: ret.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } }); };
      if (url.searchParams.get('error')) return back({ error: url.searchParams.get('error_description') || url.searchParams.get('error') });
      const code = url.searchParams.get('code'); if (!code) return back({ error: 'GitHub didn’t return a sign-in code.' });
      if (!env.GITHUB_CLIENT_SECRET) return back({ error: 'The relay is missing GITHUB_CLIENT_SECRET.' });
      let r; try { r = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'content-type': 'application/json', 'user-agent': 'slidewright-auth-relay' },
        body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: url.origin + '/callback' })
      }); } catch (e) { return back({ error: 'The relay could not reach GitHub (' + (e && e.message || e) + ').' }); }
      let j = {}; try { j = await r.json(); } catch {}
      if (!j.access_token) return back({ error: (j.error_description || j.error || 'GitHub did not issue a token') + ' (GitHub answered ' + r.status + (j.error ? ', ' + j.error : '') + ').' });
      return back({ token: j.access_token, scope: j.scope || '' });
    }

    return text('Slidewright sign-in relay. Nothing to see here.');
  }
}
