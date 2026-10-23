# Browser-code security

Files delivered to a player's browser cannot be kept secret. The browser must download JavaScript, CSS, images, and other assets before it can run the game, so a player can always view or copy them with DevTools, the network panel, or a saved page.

Production builds are minified and do not include source maps. This makes the bundle smaller and avoids publishing original TypeScript source, but it is not encryption or an access-control system.

## Put secrets and authority on the server

- Keep database URLs, owner passwords, payment-provider secret keys, webhook secrets, and signing keys only in .env or the host's private environment settings.
- Never add a secret to the client source, public assets, Vite public variables, HTML, client-side storage, or a browser request body.
- Treat browser-supplied roles, prices, reward amounts, account IDs, and feature flags as untrusted. Validate them in the API before making a change.
- Keep owner-only writes behind authenticated API routes. The browser may hide controls, but the server must enforce permission.

## Offline owner mode

The offline owner path is a local-only fallback. It never sends API requests or writes shared data. Its phrase is a convenience check, not a secret: a value checked in browser code can be inspected or reproduced. The API creates the device eligibility record only after the signed-in owner account matches vslxped@gmail.com, but browser-local data cannot provide the same level of protection as a live server session.

If owner access must remain cryptographically protected during an outage, use a separate hardware-backed or external authenticator with a previously registered device. Do not rely on a browser-only phrase.
