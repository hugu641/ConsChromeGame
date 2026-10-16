CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  name_lower  TEXT    NOT NULL UNIQUE,
  salt        TEXT    NOT NULL,
  hash        TEXT    NOT NULL,
  balance     INTEGER NOT NULL DEFAULT 1000 CHECK (balance >= 0),
  last_daily  INTEGER NOT NULL DEFAULT 0,
  fails       INTEGER NOT NULL DEFAULT 0,
  lock_until  INTEGER NOT NULL DEFAULT 0,
  created     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_balance ON users (balance DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  expires    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS reg_ip (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reg_ip ON reg_ip (ip, ts);
