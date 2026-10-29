# Slidewright sign-in relay

This tiny Cloudflare Worker lets Slidewright show a **Sign in with GitHub** button.

GitHub's sign-in ends with a step that swaps a one-time code for an access token, and that step needs the app's client secret. A web page can't keep a secret, and GitHub doesn't allow that step from a browser, so this worker does it and hands the token back to Slidewright. It stores nothing.

Setup takes about ten minutes, once. It's free on Cloudflare's plan.

## 1. Create the worker

1. Sign in (or sign up) at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages → Create → Create Worker**, start from “Hello World”, name it `slidewright-auth`, and click **Deploy**.
3. Note its address, which looks like `https://slidewright-auth.YOUR-NAME.workers.dev`.
4. Click **Edit code**, replace everything with the contents of [`worker.js`](worker.js), and click **Deploy**.

## 2. Register Slidewright with GitHub

1. Open [github.com/settings/applications/new](https://github.com/settings/applications/new) (Settings → Developer settings → OAuth Apps → New OAuth App).
2. Fill in:
   - **Application name:** Slidewright
   - **Homepage URL:** `https://jessetnroberts.github.io/slidewright/`
   - **Authorization callback URL:** your worker address plus `/callback`, e.g. `https://slidewright-auth.YOUR-NAME.workers.dev/callback`
3. Click **Register application**. Copy the **Client ID**, then click **Generate a new client secret** and copy the secret (GitHub shows it only once).

## 3. Give the worker its settings

In Cloudflare, open the worker → **Settings → Variables and Secrets** and add:

| Name | Type | Value |
|---|---|---|
| `GITHUB_CLIENT_ID` | Text | the Client ID |
| `GITHUB_CLIENT_SECRET` | Secret | the client secret |
| `ALLOWED_ORIGINS` | Text | `https://jessetnroberts.github.io` |

Optional: `SCOPE` = `public_repo` if every deck lives in a public repository. The default, `repo`, also covers private course repositories.

Save and deploy.

## 4. Point Slidewright at the relay

In the repository's `index.html`, set the relay address in this line near the top:

```html
<meta name="slidewright-auth-relay" content="https://slidewright-auth.YOUR-NAME.workers.dev">
```

Commit it, and the **Sign in with GitHub** button appears the next time the site loads. Until then, Slidewright falls back to asking for a personal access token.

## How it works

1. Slidewright opens a small window at `/login` on the worker, with a one-time random value.
2. The worker sends that window to GitHub, where you approve Slidewright.
3. GitHub returns to the worker's `/callback`, which swaps the code for a token using the secret.
4. The worker sends the window to Slidewright's `auth.html`, which passes the token to the open editor (same site only) and closes.

The token stays in your browser's storage on that device. **Sign out of GitHub** in Slidewright's menu removes it; [github.com/settings/applications](https://github.com/settings/applications) revokes Slidewright's access entirely. The worker only accepts sign-ins for the sites listed in `ALLOWED_ORIGINS`.
