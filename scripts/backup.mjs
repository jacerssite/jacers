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

function findMongoDump() {
  if (process.env.MONGODUMP_PATH) return process.env.MONGODUMP_PATH;
  if (process.platform !== "win32") return "mongodump";

  // The Windows Database Tools archive can be used without modifying PATH.
  // This is the documented default location for this project; an environment
  // override is still available above for a custom installation.
  const toolsRoot = process.env.MONGODB_TOOLS_DIR || "C:\\mongoDBTools";
  try {
    const toolFolder = fs.readdirSync(toolsRoot, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && entry.name.startsWith("mongodb-database-tools-"));
    const executable = toolFolder && path.join(toolsRoot, toolFolder.name, "bin", "mongodump.exe");
    if (executable && fs.existsSync(executable)) return executable;
  } catch {
    // Fall back to PATH and report the normal actionable error if unavailable.
  }
  return "mongodump";
}

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
  if (status) console.warn("Warning: the working tree has uncommitted changes; a binary-safe patch will be included beside the source bundle.");

  const sourceBundle = path.join(output, "source.bundle");
  run("git", ["bundle", "create", sourceBundle, "--all"]);
  // A Git bundle only includes commits. Preserve tracked edits as well, so a
  // source-only emergency backup includes the current work in progress.
  const workingTreePatch = run("git", ["diff", "--binary"]);
  const workingTreePatchName = workingTreePatch ? "working-tree.patch" : null;
  if (workingTreePatchName) fs.writeFileSync(path.join(output, workingTreePatchName), `${workingTreePatch}\n`);

  let databaseBackedUp = false;
  if (!sourceOnly) {
    const databaseDir = path.join(output, "database");
    fs.mkdirSync(databaseDir, { recursive: true });
    try {
      run(findMongoDump(), ["--uri", databaseUri, "--out", databaseDir, "--gzip"], { stdio: "inherit" });
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
    workingTreePatch: workingTreePatchName,
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
