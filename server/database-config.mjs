export function getMongoDatabaseConnectionString(environment = process.env) {
  // Keep the existing explicit setting first so adding a Vercel integration
  // cannot silently move an existing deployment to a different database.
  for (const key of ["DATABASE_MONGODB_URI", "MONGODB_URI", "DATABASE_URL"]) {
    const value = environment[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function getMongoDatabaseConfigurationError(connectionString, { vercel = false } = {}) {
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    return "MONGODB_URI or DATABASE_MONGODB_URI must be configured before the API can start.";
  }

  let database;
  try {
    database = new URL(connectionString);
  } catch {
    return "The configured MongoDB connection URL must be valid.";
  }

  if (!["mongodb:", "mongodb+srv:"].includes(database.protocol)) {
    return "The configured MongoDB connection URL must use the mongodb:// or mongodb+srv:// protocol.";
  }

  const hostname = database.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback = hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "::1"
    || hostname === "0.0.0.0"
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);

  if (vercel && isLoopback) {
    return "The configured MongoDB connection URL points to a local address. Vercel cannot reach a MongoDB server on localhost; use the MongoDB Atlas connection string.";
  }

  return null;
}
