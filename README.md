# Jacer

## Online accounts and leaderboard

The online leaderboard and accounts use a Node.js API and MongoDB. User passwords are stored as Argon2id password hashes, never as reversible encrypted values. Login sessions use random opaque tokens; only SHA-256 token hashes are stored in the database.

### Local development

1. Install Node.js 20.19 or newer and create a MongoDB Atlas cluster (or use another reachable MongoDB server).
2. Copy `.env.example` to `.env`, then set `MONGODB_URI`, `OWNER_PASSWORD`, and `ADDITIONAL_OWNER_PASSWORD` in the ignored `.env` file. Use the connection URI from MongoDB Atlas; keep all credentials private. The existing `DATABASE_MONGODB_URI` setting is also supported and takes precedence.
3. Run `npm install`.
4. In one terminal run `npm run server`; in another run `npm run dev`. Vite proxies `/api` requests to the API on port 3001.

The web server starts listening immediately, then initializes the online API in the background. If MongoDB is unavailable, the server stays running and retries initialization 10 seconds after each failed attempt. The built game (when `dist` exists) and `/api/health` remain available; online routes return HTTP 503 until initialization finishes. Accounts and leaderboard features become available automatically when MongoDB connects and setup completes.

The API provisions the reserved owner accounts `vslxped` and `riverwth` from `OWNER_PASSWORD` and `ADDITIONAL_OWNER_PASSWORD`. It stores Argon2id hashes and reapplies the configured secrets at startup, so changing a private environment value rotates that owner's password. Other registered accounts cannot receive the owner role. The owner indicator appears only for authenticated owner sessions.

The API initializes its MongoDB collections and indexes on startup. While signed in, player progress, currency, inventory, unlocks, loadout, settings, and personal levels sync to the account and are restored on other signed-in devices. Signing out stops account synchronization. Players can change their username once every seven days. The owner-only tester panel saves shared world settings, roulette tiers, and workshop levels, and includes tools to view player stats, edit saved player data and usernames, grant currency and power-up skills, unlock or clear levels, unlock cosmetics, and ban or restore player accounts. Owners can also publish a public update log shown in Credits. Published workshop levels can be edited and playtested before saving.

### Render deployment

Create a MongoDB Atlas cluster and a Node web service in Render. Set the service build command to `npm ci && npm run build` and the start command to `npm start`. Configure `DATABASE_MONGODB_URI`, `OWNER_PASSWORD`, `ADDITIONAL_OWNER_PASSWORD`, and `NODE_ENV=production` as private service environment variables. Use the MongoDB connection URI and owner passwords directly in the private deployment dashboard; never commit these secrets. The server creates its indexes and default settings on startup and serves the built client and API from the same origin.

The owner can edit or remove leaderboard entries and change the golden-skin clear-time threshold in the online leaderboard, available from Launch Mission. The home-screen account control is separate. Player submissions keep each player's fastest time per route; the leaderboard displays the player's username, route, time, and abilities used.

Online presence is shown publicly on the leaderboard and in the owner-only Player accounts panel. Signed-in clients send a heartbeat every 30 seconds; a player is shown online while their session has checked in within the last 90 seconds. Players can choose "Appear offline" in Account settings to hide their status publicly and on their profile. Player profiles show their current character loadout, completion stats, presence, and an optional title earned by completing route milestones.

### Vercel deployment

Import the repository into Vercel and use the project defaults. Vercel runs `npm run build`, publishes `dist`, routes `/api/*` requests through the shared serverless function in `api/router.mjs`, and rewrites other non-file frontend routes to `index.html`. The router restores each original API path before passing the request to Express. It initializes MongoDB indexes, default settings, and owner accounts when it first receives a request in a warm instance.

Connect the MongoDB Atlas resource to this Vercel project in the Marketplace integration, including the Production environment. The native integration supplies `MONGODB_URI` automatically; set `OWNER_PASSWORD` and `ADDITIONAL_OWNER_PASSWORD` as private environment variables for Production as well (and Preview if those deployments should have working accounts). Existing `DATABASE_MONGODB_URI` takes precedence over `MONGODB_URI`, followed by the legacy `DATABASE_URL`; make sure any existing explicit setting points to the intended database. Do not use `localhost` or `127.0.0.1` on Vercel. The function reuses a MongoDB client and lets Vercel manage idle connections. Vercel sets `NODE_ENV=production`, which enables secure session cookies. After connecting the integration or changing environment variables, redeploy the project.

The URI's database name determines where accounts are stored; adding or changing it can make existing players appear to be missing. If the API still returns 503, check the Vercel Function logs and confirm the resource is connected to the correct environment and the cluster is available. The Atlas native integration normally configures network access for Vercel deployments; check the integration and Atlas Network Access if connections still time out. Do not paste database credentials into logs or support messages.

The MongoDB collections start empty. If you previously had live player/account data in PostgreSQL, that data must be migrated separately; changing the database URI does not copy PostgreSQL records into MongoDB.

For local development, `npm run server` still starts the persistent Express API, and `npm run dev` runs Vite with its `/api` proxy.
