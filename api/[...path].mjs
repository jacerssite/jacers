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
    return app(req, res);
  } catch (error) {
    console.error("Could not initialize the Jacer API:", error);
    return res.status(503).json({ error: "The online service is temporarily unavailable." });
  }
}
