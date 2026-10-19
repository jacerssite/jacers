// Older databases may contain a TTL index that must not delete recovery records.
// A new MongoDB database may not have the collection (or the index) yet.
export async function dropLegacyRecoveryIndex(recoveryAttempts) {
  try {
    await recoveryAttempts.dropIndex("windowExpiresAt_1");
  } catch (error) {
    if (error?.code !== 26 && error?.code !== 27) throw error;
  }
}
