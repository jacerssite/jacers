export function getMongoDatabaseConfigurationError(connectionString, { vercel = false } = {}) {
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    return "DATABASE_MONGODB_URI must be configured before the API can start.";
  }

  let database;
  try {
    database = new URL(connectionString);
  } catch {
    return "DATABASE_MONGODB_URI must be a valid MongoDB connection URL.";
  }

  if (!["mongodb:", "mongodb+srv:"].includes(database.protocol)) {
    return "DATABASE_MONGODB_URI must use the mongodb:// or mongodb+srv:// protocol.";
  }

  const hostname = database.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback = hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "::1"
    || hostname === "0.0.0.0"
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);

  if (vercel && isLoopback) {
    return "DATABASE_MONGODB_URI points to a local address. Vercel cannot reach a MongoDB server on localhost; use the MongoDB Atlas connection string.";
  }

  return null;
}
