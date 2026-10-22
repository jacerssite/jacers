import app, { initializeDatabase } from "./index.mjs";

const port = Number(process.env.PORT ?? 3001);

initializeDatabase().then(() => {
  app.listen(port, "0.0.0.0", () => console.log(`Jacer API listening on port ${port}.`));
}).catch((error) => {
  console.error("Could not initialize the Jacer API:", error);
  if (error?.name === "MongoServerSelectionError" || error?.code === "ETIMEDOUT") {
    console.error("MongoDB could not be reached. Check that the Atlas cluster is running and that this machine's public IP is allowed in Atlas Network Access.");
  }
  process.exitCode = 1;
});
