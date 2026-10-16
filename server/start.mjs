import app, { initializeDatabase } from "./index.mjs";

const port = Number(process.env.PORT ?? 3001);

initializeDatabase().then(() => {
  app.listen(port, "0.0.0.0", () => console.log(`Jacer API listening on port ${port}.`));
}).catch((error) => {
  console.error("Could not initialize the Jacer API:", error);
  process.exitCode = 1;
});
