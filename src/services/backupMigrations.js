export const CURRENT_BACKUP_VERSION = 1;

const migrations = {};

export function migrateBackup(backup) {
  let version = backup.backupVersion || 1;

  if (version > CURRENT_BACKUP_VERSION) {
    const err = new Error(
      `This backup is from a newer version of the app (backup v${version}, ` +
      `this app understands up to v${CURRENT_BACKUP_VERSION}). Please update the app first.`
    );
    err.code = 'backup_from_newer_version';
    throw err;
  }

  let data = backup;
  while (version < CURRENT_BACKUP_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      const err = new Error(`No migration path found from backup version ${version}.`);
      err.code = 'missing_migration_path';
      throw err;
    }
    data = migrate(data);
    version++;
  }

  data.backupVersion = CURRENT_BACKUP_VERSION;
  return data;
}
