// ── Table names ───────────────────────────────────────────────────────────────
export const TABLES = {
  CONTACTS:         'contacts',
  MESSAGES:         'messages',
  PENDING_MESSAGES: 'pending_messages',
  IDENTITY:         'identity',
};

// ── CREATE TABLE statements ───────────────────────────────────────────────────
export const SQL_CREATE_IDENTITY = `
  CREATE TABLE IF NOT EXISTS ${TABLES.IDENTITY} (
    id          INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
    username    TEXT    NOT NULL,
    device_id   TEXT    NOT NULL,
    public_key  TEXT    NOT NULL
  );
`;

export const SQL_CREATE_CONTACTS = `
  CREATE TABLE IF NOT EXISTS ${TABLES.CONTACTS} (
    device_id   TEXT    PRIMARY KEY,
    username    TEXT    NOT NULL,
    public_key  TEXT    NOT NULL,
    created_at  INTEGER NOT NULL
  );
`;

export const SQL_CREATE_MESSAGES = `
  CREATE TABLE IF NOT EXISTS ${TABLES.MESSAGES} (
    id          TEXT    PRIMARY KEY,
    device_id   TEXT    NOT NULL,
    direction   TEXT    NOT NULL CHECK (direction IN ('in', 'out')),
    plaintext   TEXT,
    ciphertext  TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent', 'stored', 'seen')),
    timestamp   INTEGER NOT NULL,
    FOREIGN KEY (device_id) REFERENCES ${TABLES.CONTACTS}(device_id)
  );
`;

export const SQL_CREATE_PENDING = `
  CREATE TABLE IF NOT EXISTS ${TABLES.PENDING_MESSAGES} (
    id             TEXT    PRIMARY KEY,
    from_device_id TEXT    NOT NULL,
    ciphertext     TEXT    NOT NULL,
    arrived_at     INTEGER NOT NULL
  );
`;
