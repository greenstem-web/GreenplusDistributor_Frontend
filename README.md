# Greenplus Distributor — frontend

React + DevExtreme, matching the accounting frontend's stack exactly (CRA 5, React 18, DevExtreme
24.2.7) so conventions and muscle memory transfer.

## The backend is a different repo

The API this talks to is `Greenplus.Distributor` inside **Greenplus_Backend** (branch
`nick_distributorPlatform`) — `Greenplus.Distributor.Api` listens on 5104. This frontend was moved
out of that repo so it stands on its own, the same way `Greenplus_Frontend` stands apart from the
accounting backend: a distributor is a separate tenant, and its UI has no reason to ship or version
with server code.

## Running

```bash
npm install
```

```bash
npm start
```

Opens on **http://localhost:3100** — not 3000, which the accounting frontend already owns. With both
on 3000 the second dev server just prints "Something is already running on port 3000" and exits.

The API base URL comes from `.env` (`REACT_APP_API_URL`, default `http://localhost:5104`). The API
must allow this origin: `Cors:AllowedOrigins` defaults to 3100 and 3000.

Use the API's **http** port. The https launch profile serves 7001 with a dev certificate the browser
rejects on fetch, and `UseHttpsRedirection` then bounces http calls at it.

## DevExtreme licence

`src/devextreme-license.js` is a placeholder, so every widget renders a trial banner. The key is the
same one the accounting frontend uses — copy it from
`Greenplus_Frontend/src/devextreme-license.js`. Left blank deliberately: a licence key is not
something to duplicate into a repo headed for its own GitHub remote without deciding first whether
it belongs in the repo or in an env var.

## Structure

| Path | Responsibility |
|---|---|
| `src/api/baseapi.js` | axios instance; the **only** place the Authorization header is set |
| `src/api/auth.js`, `catalog.js` | one function per endpoint, no UI concerns |
| `src/contexts/auth.js` | session state; restores from `/api/auth/me` on load |
| `src/pages/login/` | login screen |
| `src/pages/catalog/` | company picker + catalog grid with the visibility switch |
| `src/layouts/AppShell.js` | header, distributor name, sign out |

Routes are chosen from auth state in `App.js` rather than guarded per route: an unauthenticated
visitor gets exactly one route, so a new page cannot be added and left reachable by accident. It
mirrors the API's authorization fallback policy.

## Two DevExtreme traps this code already works around

Both compile, pass review, and only fail at runtime — found by driving the real UI.

**`TextBox` commits on blur by default.** Without `valueChangeEvent="input"`, the Sign in button
stays disabled while you type, so a user's first click merely blurs the field and is swallowed.

**Never alternate `Button`'s `render` prop between a function and `undefined`.** DevExtreme then
tears down a template React has already unmounted and the page dies with
`Failed to execute 'removeChild' on 'Node'`. Use one constant `render` function that switches its
own contents.

## The catalog grid's one rule

Patch rows from the **PUT response**, never from the switch position. Setting visibility back to an
item's default deletes the override, so `isOverride` can come back `false` on a change the user just
made. `action` is `created`, `updated`, `removed` or `unchanged`.

The switch's `onValueChanged` also guards with `if (!e.event) return;` — DevExtreme fires it for
programmatic changes too, so without the guard patching state calls the API again and toggles the
value straight back.

## Not built yet

Analytics/dashboard, catalog CRUD (items are seeded by SQL for now), and company consent management.
