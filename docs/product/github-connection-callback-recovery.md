# GitHub connection callback recovery

GitHub's `redirect_uri is not associated with this application` error blocks the
GitHub App authorization step before this server receives an authorization code.
Align the selected development address, server configuration and registration of
the GitHub App used by the repository connector.

## Observed failure (2026-10-10)

- The connection started at `https://dev.aicareershub.tech/integrations/github/install`
  and GitHub returned to `http://localhost:3000/integrations/github/install/callback`.
  The first callback failed `INVALID_OAUTH_STATE`. The host switch explains a
  missing installation cookie or different login session; those conditions must
  continue to reject. Logs do not identify which individual state comparison failed.
- A fresh attempt entirely on localhost passed the installation callback and
  returned HTTP302 to the GitHub App authorization step. This redirect does not
  mean a connection was linked. No successful authorization callback is shown.
- Inspection of only non-secret URL settings found `.env.local` specifies
  `APP_URL=http://localhost:3000` and a localhost login callback.
  `GitHubInstallationService` derives its fixed authorization callback from
  `APP_URL` and uses it as `redirect_uri`. Login's dynamic callback resolution
  does not change this connector contract.
- GitHub rejects an authorization callback that is not registered for the App
  identified by `GITHUB_APP_CLIENT_ID`. The actual registration was not inspected;
  a missing callback or credentials from another App must be corrected by its owner.

## Choose one address for the whole connection

| Setting | Public development address | Local development address |
| --- | --- | --- |
| `APP_URL` | `https://dev.aicareershub.tech` | `http://localhost:3000` |
| `GITHUB_OAUTH_REDIRECT_URI` (login) | `https://dev.aicareershub.tech/auth/github/callback` | `http://localhost:3000/auth/github/callback` |
| GitHub **App Setup URL** | `https://dev.aicareershub.tech/integrations/github/install/callback` | `http://localhost:3000/integrations/github/install/callback` |
| GitHub **App Callback URL** (user authorization) | `https://dev.aicareershub.tech/integrations/github/authorize/callback` | `http://localhost:3000/integrations/github/authorize/callback` |

1. Set the two non-secret environment values for the selected address in the
   effective configuration file. For ordinary `npm run dev`, `.env.local`
   overrides `.env`; explicit `ENV_FILE` or `APP_ENV` can select a different file.
   Leave secrets and application identifiers unchanged unless they are demonstrably
   from the wrong registration.
2. In GitHub Settings -> Developer settings -> GitHub Apps -> the connector App's
   settings, set the Setup URL and register the user authorization Callback URL
   from the same column. The two paths serve different steps. The login OAuth
   App's `/auth/github/callback` is not the connector's authorization callback.
   `GITHUB_APP_ID`, slug, client ID, client secret and private key must identify
   the same GitHub App. Do not put credential values in chat or terminal output.
   Enable **Redirect on update** next to the Setup URL so changing an existing
   installation's repository selection returns to this server for verification.
3. Keep automatic "Request user authorization (OAuth) during installation"
   disabled: this server starts its own installation-bound PKCE authorization.
   Keep existing permissions and exact callback restrictions. Registering an
   explicit additional callback is preferable to enabling wildcard matching.
4. Restart the development server after changing environment settings. Open the
   selected address, sign in there and start a **new** Sources -> Connect GitHub App
   flow. Do not revisit the previous callback URL or copy its state between hosts.
5. Finish installation and user authorization on the same address. Successful
   installation callback302 alone is insufficient; the authorization callback
   must verify identity/installation ownership and complete the connection write.
   Then select/synchronize authorized repositories, regenerate the application
   package and obtain fresh review/approval.

This procedure does not reactivate sources in the database, trust stale packages,
relax state/cookie/session validation or modify production configuration.
Restoring the connection and synchronizing sources remain external acceptance.

## Expired callback or installation updated without a return (2026-10-10)

The later supplied authorization callback reached the public development host,
so its address now agrees with the public configuration. However, its signed
state had expired **72.8 minutes before the request**. It correctly failed
`INVALID_OAUTH_STATE`; no connection write follows that refusal. A restart does
not extend the signed expiry. This state requires a new flow even if GitHub
already shows the App as installed.

The following fresh `/integrations/github/install` request returned302, but the
provided logs show neither installation nor authorization callback afterward.
An App's installation on GitHub alone does not complete this platform's user
identity/installation-ownership verification. Check **Redirect on update** and
finish the flow initiated from Sources; do not start from an old authorization
tab, a bookmark or GitHub's App settings directly. Complete each verification
phase within its ten-minute validity window on the public development host.
The missing callback's actual cause remains unverified; a redirect setting is a
recovery check, not a confirmed diagnosis of the GitHub account configuration.

Authenticated HTML connector-state failures now return to Sources with this
recovery explanation, rather than redirecting through login and losing the
message on the dashboard. JSON callers still receive401 with the original error
code. Unauthenticated failures and platform-login failures retain their existing
login recovery. No state is accepted, extended, replayed or automatically linked.

## Fresh cross-host callback (2026-10-10 follow-up)

The latest attempt has a fresh authorization state with roughly599seconds still
remaining, so the earlier expired-state diagnosis does not apply to this attempt.
Its installation callback arrives on `localhost`, succeeds and issues a new
authorization-phase state cookie there. Its authorization callback then arrives
on `dev.aicareershub.tech` and fails `INVALID_OAUTH_STATE`.

The state cookie has no Domain attribute and is host-only. The cookie issued on
localhost cannot accompany the callback on the public development host; a prior
public-host cookie, if present, cannot match the newly issued localhost token.
This is a sufficient rejection mechanism under the unchanged state contract.
Browser cookie headers were not captured, and the remote GitHub registration was
not directly inspected.

Correct the connector GitHub App's **Setup URL** to
`https://dev.aicareershub.tech/integrations/github/install/callback` and save it,
with **Redirect on update** enabled. Keep its **Callback URL** as
`https://dev.aicareershub.tech/integrations/github/authorize/callback`.
Changing only the authorization Callback URL leaves this host mismatch unresolved.
Close old flow tabs and initiate a fresh connection from the public Sources page.
Both callbacks must return to that public host before a connection can be claimed.
Do not share state cookies between hosts or accept a mismatched cookie.

## Terminal rejection reasons

If a fresh attempt still fails after correcting both return addresses, the browser
message alone cannot distinguish the remaining cause. The warning log now includes
`installationStateFailure`, a fixed server-only reason code:

| Reason | Recovery check |
| --- | --- |
| `MISSING_COOKIE` / `COOKIE_MISMATCH` | Confirm both callbacks use the same host and browser session; close competing connection tabs and start one fresh flow. |
| `EXPIRED_STATE` | Start a new flow and finish each phase within ten minutes. |
| `SESSION_MISMATCH` / `USER_MISMATCH` / `TENANT_MISMATCH` / `GITHUB_IDENTITY_MISMATCH` | Start again after signing in to the intended account; avoid account changes mid-flow. |
| `CALLBACK_MISMATCH` | Start again after aligning APP_URL and GitHub's Setup/Callback settings; old state retains its previous callback binding. |
| `DURABLE_STATE_UNAVAILABLE` | The signed state has no matching live database row; a consumed, removed or independently expired row requires a fresh flow. This reason does not assert which occurred. |
| `PHASE_MISMATCH` | Check automatic OAuth during installation is OFF, Setup URL points to install/callback, Callback URL points to authorize/callback, and Redirect on update is ON; save and start a fresh flow from Sources. |
| `INSTALLATION_MISMATCH` | Restart from Sources; do not reuse or move callbacks between installations. |
| `INVALID_SIGNATURE` | Start fresh; if repeated, inspect consistent server signing/encryption configuration without sharing keys. |
| `MISSING_STATE` / `STATE_TOO_LONG` / `MALFORMED_PAYLOAD` / `INVALID_EXPIRY` / `INVALID_CODE` | Start a complete new flow rather than editing or revisiting a callback URL. |

Share only the reason and request ID when diagnosing a failure. Do not share
authorization codes, state tokens, cookies or credentials. This diagnostic field
does not contain input values and is not included in API responses or browser
flash messages. Existing incoming-request URL logging is unchanged by this
bounded diagnostics addition.

## Confirmed wrong callback phase (2026-10-10 follow-up)

Request `4c85b101-b872-4d46-ac36-a0be480a9758` now explicitly reports
`installationStateFailure: PHASE_MISMATCH`. The provided callback reaches the
public authorization path with an installation-phase state and installation
update parameters. The state still has roughly 9.6 minutes of validity, so the
earlier expiry and cross-host diagnoses do not explain this attempt. Cookie
equality and signature validation precede this phase check; durable state
consumption and provider verification have not occurred when it rejects.

GitHub's [registration settings documentation](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration#adding-or-updating-a-setup-url)
explains that enabling **Request user authorization (OAuth) during installation**
disables the Setup URL and redirects directly to the Callback URL. That setting
is the leading explanation for this request; an incorrect Setup URL could also
route installation state to the wrong step. Remote settings were not inspected.
For this server's existing two-step flow, turn the automatic OAuth option OFF,
use the public Setup and Callback URLs in the table above, enable **Redirect on
update**, save and initiate a fresh public Sources connection. The server then
issues its own installation-bound authorization state and PKCE challenge.

Authenticated browser phase failures now show these specific configuration
instructions. Other state failures keep their existing recovery; JSON remains
401 with its original code and no diagnostic reason. No phase validation is
bypassed, no installation-phase code is exchanged, and no connection is marked
active merely because GitHub reports the App installed.

## Verification

The existing unit tests exercise callback resolution, rejection of missing or
mismatched cookies, foreign sessions/identities/tenants/callbacks, expired state,
and cookie policy. These are local contract checks; they do not verify a real
GitHub registration or provider consent. The public-origin checks also confirm
that the connector callback follows explicitly configured `APP_URL`, rather than
an arbitrary incoming request host.

Official references: [GitHub App callback URLs](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-user-authorization-callback-url)
and [GitHub App setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url).
