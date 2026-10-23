import app, { initializeDatabase } from "./index.mjs";
import { pathToFileURL } from "node:url";

export function startServer({ port = Number(process.env.PORT ?? 3001), retryDelayMs = 10000 } = {}) {
  let retryTimer;
  let stopped = false;

  async function connectDatabase() {
    try {
      await initializeDatabase();
      if (!stopped) console.log("Jacer API is ready.");
    } catch (error) {
      if (stopped) return;
      console.warn(`MongoDB is unavailable (${error?.code ?? error?.name ?? "unknown error"}). The server will keep running and retry in ${retryDelayMs / 1000} seconds.`);
      retryTimer = setTimeout(connectDatabase, retryDelayMs);
      retryTimer.unref();
    }
  }

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Jacer web server listening on port ${server.address().port}. Starting the API...`);
    void connectDatabase();
  });
  server.once("close", () => {
    stopped = true;
    clearTimeout(retryTimer);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
