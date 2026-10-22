import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Small local backup helper. It never uploads files or writes secrets to the manifest.
const repo = process.cwd();
const args = process.argv.slice(2);
const sourceOnly = args.includes("--source-only");
const outputIndex = args.indexOf("--output");
const requestedOutput = outputIndex >= 0 ? args[outputIndex + 1] : null;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.resolve(repo, requestedOutput || path.join("backups", stamp));
const databaseUri = process.env.DATABASE_MONGODB_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: repo, encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
  return result.stdout?.trim() || "";
}

function main() {
  if (!sourceOnly && !databaseUri) {
    throw new Error("No MongoDB connection string found. Set DATABASE_MONGODB_URI in .env or use --source-only.");
  }

  fs.mkdirSync(output, { recursive: true });
  const status = run("git", ["status", "--porcelain"]);
  if (status) console.warn("Warning: the working tree has uncommitted changes; the bundle still includes all commits.");

  const sourceBundle = path.join(output, "source.bundle");
  run("git", ["bundle", "create", sourceBundle, "--all"]);

  let databaseBackedUp = false;
  if (!sourceOnly) {
    const databaseDir = path.join(output, "database");
    fs.mkdirSync(databaseDir, { recursive: true });
    try {
      run("mongodump", ["--uri", databaseUri, "--out", databaseDir, "--gzip"], { stdio: "inherit" });
      databaseBackedUp = true;
    } catch (error) {
      throw new Error(`Database backup failed. Install MongoDB Database Tools and allow this machine in Atlas Network Access. ${error.message}`);
    }
  }

  const manifest = {
    format: 1,
    createdAt: new Date().toISOString(),
    commit: run("git", ["rev-parse", "HEAD"]),
    sourceBundle: path.basename(sourceBundle),
    databaseBackedUp,
    checksum: crypto.createHash("sha256").update(fs.readFileSync(sourceBundle)).digest("hex"),
  };
  fs.writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Backup written to ${path.relative(repo, output)}`);
}

try {
  main();
} catch (error) {
  console.error(`Backup failed: ${error.message}`);
  process.exitCode = 1;
}
