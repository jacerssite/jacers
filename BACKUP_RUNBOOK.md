# Backup and recovery runbook

This project follows a simple 3-2-1 plan:

1. The live copy is the deployed site and MongoDB Atlas database.
2. A second copy is made locally with `npm run backup`.
3. Copy the finished folder to a different provider or device (encrypted cloud storage, an external drive, or both). Do not keep the only backup beside the live server.

## Create a backup

Install the MongoDB Database Tools so `mongodump` is available, then make sure the machine is allowed in MongoDB Atlas Network Access. Run:

```powershell
npm run backup
```

The command creates an ignored `backups/<timestamp>/` folder containing a compressed database dump, a Git source bundle, and a small manifest. When there are tracked, uncommitted edits it also saves them in `working-tree.patch`, so the backup contains the current work as well as committed history. It never stores the database URI in the manifest. If Atlas is unavailable, a source-only backup is still useful:

```powershell
npm run backup -- --source-only
```

Keep `.env`, database dumps, and cloud credentials private. The `backups/` folder is intentionally ignored by Git. Sync completed backup folders to an off-site location after each run; this script does not upload to a cloud provider automatically.

Recommended schedule: database daily, source weekly and after major releases. Keep at least 14 daily copies and 8 weekly copies, deleting only old copies that are already stored elsewhere.

## Restore

1. Create a clean server and install Node.js, Git, and MongoDB Database Tools.
2. Restore the database (replace the URI with a secret kept outside the repository):

```powershell
mongorestore --uri "<MONGODB_URI>" --gzip --drop .\database
```

3. Restore source from the bundle, or clone the repository and check out the commit in `manifest.json`:

```powershell
git bundle verify .\source.bundle
git clone .\source.bundle restored-site
cd restored-site
npm ci
npm run build
```

4. Create a new `.env` from `.env.example`, add the restored database URI and other deployment secrets, then start the service with `npm run server` and the frontend with `npm run dev` (or the production host command).
5. Confirm sign-in, chat, level loading, progress saves, and leaderboard requests before switching DNS.

## Outage procedure and testing

Use the hosting provider's standby server or deploy the latest off-site folder, then point DNS to the healthy server. Record the time of the outage and the backup timestamp used. Test a full restore in a temporary environment at least twice per year; a backup is not proven until the site starts and its key flows work.

Target expectations for this project are a daily data recovery point and a same-day recovery time. A provider-specific hot failover can be added later without changing this backup format.
