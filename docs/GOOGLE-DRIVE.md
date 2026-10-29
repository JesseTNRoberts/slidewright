# Setting up Google Drive

Slidewright can open decks from Google Drive and save them back. To do that, Google needs to know about the app, so there is a one-time setup in Google Cloud. It takes about ten minutes and costs nothing.

At the end you will have three values to paste into `index.html`:

| Value | Looks like | Goes in |
|---|---|---|
| OAuth client ID | `1234567890-abc….apps.googleusercontent.com` | `slidewright-google-client-id` |
| API key | `AIzaSy…` | `slidewright-google-api-key` |
| Project number | `1234567890` | `slidewright-google-app-id` |

## 1. Create a project

1. Go to <https://console.cloud.google.com/> and sign in with the Google account whose Drive you use.
2. Use the project picker at the top: **New project**, name it `Slidewright`, then **Create**. Make sure it is selected.

## 2. Turn on the two APIs

In **APIs & Services → Library**, search for and **Enable** each of:

- **Google Drive API**
- **Google Picker API**

## 3. Set up the consent screen

**APIs & Services → OAuth consent screen** (in newer consoles: **Google Auth Platform → Branding / Audience / Data access**).

1. App name `Slidewright`, your email as the support and developer contact.
2. Audience: **External**. Leave it in **Testing**, and under **Test users** add your own Google address (and anyone else who will use it, up to 100).
3. Data access / scopes: **Add or remove scopes**, tick `…/auth/drive.file` ("See, edit, create and delete only the specific Google Drive files you use with this app"). This is a non-sensitive scope, so no Google review is needed.

In Testing mode Google asks you to sign in again about once a week. To stop that, choose **Publish app** later; with only the `drive.file` scope, publishing does not need verification.

## 4. Create the OAuth client ID

**APIs & Services → Credentials → Create credentials → OAuth client ID**

- Application type: **Web application**, name `Slidewright`
- **Authorized JavaScript origins**: add
  - `https://www.jessetnroberts.com`
  - `https://jessetnroberts.com`
- Authorized redirect URIs: leave empty (Slidewright uses a pop-up, not a redirect).

Create, and copy the **Client ID**. You do not need the client secret.

## 5. Create the API key

**Credentials → Create credentials → API key**, then **Edit API key**:

- **Application restrictions → Websites**, add:
  - `https://www.jessetnroberts.com/*`
  - `https://jessetnroberts.com/*`
  - `https://docs.google.com/*` (the file picker runs there; without it you get "The API developer key is invalid")
- **API restrictions → Restrict key**: tick **Google Picker API** and **Google Drive API**.

Save, and copy the key.

## 6. Find the project number

**IAM & Admin → Settings** (or the project dashboard) shows the **Project number**, digits only. It must be the same project as the client ID.

## 7. Put the values in Slidewright

In `index.html`, fill in the three meta tags near the top:

```html
<meta name="slidewright-google-client-id" content="…apps.googleusercontent.com">
<meta name="slidewright-google-api-key" content="AIzaSy…">
<meta name="slidewright-google-app-id" content="1234567890">
```

Commit; the site redeploys in a minute or two. None of these values is a secret: the key and client ID only work from the origins listed above.

## Using it

From the **⋯** menu:

- **Open from Google Drive…** picks an `.html` deck. After that, **Save** (Ctrl S) writes back to the same Drive file. If the file changed in Drive since you opened it, Slidewright asks before overwriting.
- **Save a copy to Google Drive…** asks for a folder and creates a new file there.
- **Google Drive versions…** lists Drive's earlier versions of the file (kept for 30 days), to compare or open.
- **Sign out of Google Drive** forgets the access, which otherwise lasts an hour and is kept only in the open page.

Slidewright only sees files you pick or create with it (the `drive.file` scope); it cannot list or read the rest of your Drive.

## When it doesn't work

| Message | Fix |
|---|---|
| "Google Drive isn't set up yet" | The meta tags in `index.html` are empty. |
| `redirect_uri_mismatch` or `origin_mismatch` | The page's address isn't in **Authorized JavaScript origins** (step 4). Include both `www.` and bare domain. |
| "Access blocked: app has not completed verification" / `access_denied` | Add your Google address as a **Test user** (step 3). |
| "The API developer key is invalid" | Add `https://docs.google.com/*` to the key's website restrictions, and check the Picker API is enabled. |
| "This app is blocked" or "contact your administrator" on a university account | Your Google Workspace admin restricts third-party apps. Use a personal Google account, or ask IT to allow the client ID. |
| The sign-in window doesn't appear | Allow pop-ups for www.jessetnroberts.com. |

Google Drive works on the published site (and on `localhost` for development). It does not work in the single-file offline copy opened from disk or inside the Claude artifact, because Google only signs in pages served from a listed web address.
