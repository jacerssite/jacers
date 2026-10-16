# Jacer

## Online accounts and leaderboard

The online leaderboard and accounts use a Node.js API and PostgreSQL. User passwords are stored as Argon2id password hashes, never as reversible encrypted values. Login sessions use random opaque tokens; only SHA-256 token hashes are stored in the database.

### Local development

1. Install Node.js 20 or newer and PostgreSQL.
2. Create a PostgreSQL database named `jacer`.
3. Copy `.env.example` to `.env`, then set `DATABASE_URL`, `OWNER_PASSWORD`, and `ADDITIONAL_OWNER_PASSWORD` in the ignored `.env` file. Keep both owner secrets out of source control.
4. Run `npm install`.
5. In one terminal run `npm run server`; in another run `npm run dev`. Vite proxies `/api` requests to the API on port 3001.

The API provisions the reserved owner accounts `vslxped` and `riverwth` from `OWNER_PASSWORD` and `ADDITIONAL_OWNER_PASSWORD`. It stores Argon2id hashes and reapplies the configured secrets at startup, so changing a private environment value rotates that owner's password. Other registered accounts cannot receive the owner role. The owner indicator appears only for authenticated owner sessions.

The owner-only tester panel saves shared world percentages, power-up spawn odds/effects, and workshop levels to PostgreSQL. These settings and published levels load for all players. Workshop drafts can be playtested without publishing; only published workshop levels can be deleted.

### Render deployment

Create a PostgreSQL database and a Node web service in Render. Set the service build command to `npm ci && npm run build` and the start command to `npm start`. Configure `DATABASE_URL`, `OWNER_PASSWORD`, `ADDITIONAL_OWNER_PASSWORD`, and `NODE_ENV=production` as private service environment variables. Use the owner passwords supplied directly in the private deployment dashboard; do not place them in frontend settings, source files, or committed environment files. The server applies its database schema on startup and serves the built client and API from the same origin.

The owner can edit or remove leaderboard entries and change the golden-skin clear-time threshold in the online leaderboard, available from Launch Mission. The home-screen account control is separate. Player submissions keep each player's fastest time per route; the leaderboard displays the player's username, route, time, and abilities used.

### Vercel deployment

Import the repository into Vercel and use the project defaults. Vercel runs `npm run build`, publishes `dist`, routes `/api/*` requests through the shared serverless function in `api/router.mjs`, and rewrites other non-file frontend routes to `index.html`. The router restores each original API path before passing the request to Express. It initializes the PostgreSQL schema and owner accounts when it first receives a request in a warm instance.

Add `DATABASE_URL`, `OWNER_PASSWORD`, and `ADDITIONAL_OWNER_PASSWORD` as private Vercel environment variables for Production (and Preview if those deployments should have working accounts). Use a PostgreSQL provider that supports serverless connections; the API limits its Vercel connection pool to one connection per function instance. Vercel sets `NODE_ENV=production`, which enables secure session cookies. After setting or changing environment variables, redeploy the project.

For local development, `npm run server` still starts the persistent Express API, and `npm run dev` runs Vite with its `/api` proxy.
