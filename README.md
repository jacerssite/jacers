# Jacer

## Online accounts and leaderboard

The online leaderboard and accounts use a Node.js API and MongoDB. User passwords are stored as Argon2id password hashes, never as reversible encrypted values. Login sessions use random opaque tokens; only SHA-256 token hashes are stored in the database.

### Local development

1. Install Node.js 20.19 or newer and create a MongoDB Atlas cluster (or use another reachable MongoDB server).
2. Copy `.env.example` to `.env`, then set `DATABASE_MONGODB_URI`, `OWNER_PASSWORD`, and `ADDITIONAL_OWNER_PASSWORD` in the ignored `.env` file. Use the connection URI from MongoDB Atlas; keep all credentials private.
3. Run `npm install`.
4. In one terminal run `npm run server`; in another run `npm run dev`. Vite proxies `/api` requests to the API on port 3001.

The API provisions the reserved owner accounts `vslxped` and `riverwth` from `OWNER_PASSWORD` and `ADDITIONAL_OWNER_PASSWORD`. It stores Argon2id hashes and reapplies the configured secrets at startup, so changing a private environment value rotates that owner's password. Other registered accounts cannot receive the owner role. The owner indicator appears only for authenticated owner sessions.

The API initializes its MongoDB collections and indexes on startup. While signed in, player progress, currency, inventory, unlocks, loadout, settings, and personal levels sync to the account and are restored on other signed-in devices. Signing out stops account synchronization. Players can change their username once every seven days. The owner-only tester panel saves shared world settings and workshop levels, and includes tools to view player stats, edit saved player data and usernames, and ban or restore player accounts. Published workshop levels can be edited and playtested before saving.

### Render deployment

Create a MongoDB Atlas cluster and a Node web service in Render. Set the service build command to `npm ci && npm run build` and the start command to `npm start`. Configure `DATABASE_MONGODB_URI`, `OWNER_PASSWORD`, `ADDITIONAL_OWNER_PASSWORD`, and `NODE_ENV=production` as private service environment variables. Use the MongoDB connection URI and owner passwords directly in the private deployment dashboard; never commit these secrets. The server creates its indexes and default settings on startup and serves the built client and API from the same origin.

The owner can edit or remove leaderboard entries and change the golden-skin clear-time threshold in the online leaderboard, available from Launch Mission. The home-screen account control is separate. Player submissions keep each player's fastest time per route; the leaderboard displays the player's username, route, time, and abilities used.

### Vercel deployment

Import the repository into Vercel and use the project defaults. Vercel runs `npm run build`, publishes `dist`, routes `/api/*` requests through the shared serverless function in `api/router.mjs`, and rewrites other non-file frontend routes to `index.html`. The router restores each original API path before passing the request to Express. It initializes MongoDB indexes, default settings, and owner accounts when it first receives a request in a warm instance.

Add `DATABASE_MONGODB_URI`, `OWNER_PASSWORD`, and `ADDITIONAL_OWNER_PASSWORD` as private Vercel environment variables for Production (and Preview if those deployments should have working accounts). Use the URI provided by your MongoDB Atlas integration, and ensure the integration exposes it under the exact name `DATABASE_MONGODB_URI`. Add Vercel's deployment IP access as appropriate in Atlas Network Access; do not use `localhost` or `127.0.0.1`. The function reuses a MongoDB client in warm instances. Vercel sets `NODE_ENV=production`, which enables secure session cookies. After setting or changing environment variables, redeploy the project.

The MongoDB collections start empty. If you previously had live player/account data in PostgreSQL, that data must be migrated separately; changing the database URI does not copy PostgreSQL records into MongoDB.

For local development, `npm run server` still starts the persistent Express API, and `npm run dev` runs Vite with its `/api` proxy.
