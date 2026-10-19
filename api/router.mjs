import app, { initializeDatabase } from "../server/index.mjs";

let initialization;

async function ensureDatabaseInitialized() {
  if (!initialization) {
    initialization = initializeDatabase().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

export default async function handler(req, res) {
  try {
    await ensureDatabaseInitialized();

    const incomingUrl = new URL(req.url ?? "/", "http://vercel.internal");
    const route = req.query?._route ?? incomingUrl.searchParams.get("_route");
    const routePath = Array.isArray(route) ? route.join("/") : route;
    if (typeof routePath !== "string" || !routePath) {
      return res.status(400).json({ error: "An API route is required." });
    }

    incomingUrl.searchParams.delete("_route");
    const encodedPath = routePath.split("/").map(encodeURIComponent).join("/");
    req.url = `/api/${encodedPath}${incomingUrl.search}`;
    return app(req, res);
  } catch (error) {
    console.error("Could not initialize the Jacer API:", error);
    if (error?.code === "DATABASE_CONFIG") {
      return res.status(503).json({ error: error.message });
    }
    if (error?.code === "ECONNREFUSED" && ["127.0.0.1", "::1", "localhost"].includes(error.address)) {
      return res.status(503).json({
        error: "The database connection points to this server instead of a hosted database. Set MONGODB_URI or DATABASE_MONGODB_URI to your MongoDB Atlas connection URL in Vercel.",
      });
    }
    return res.status(503).json({ error: "The online service is temporarily unavailable." });
  }
}
