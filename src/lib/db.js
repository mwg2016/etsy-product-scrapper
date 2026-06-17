// Lightweight MySQL layer (Aiven / PlanetScale / any MySQL 8).
import mysql from "mysql2/promise";

function poolConfigFromUrl(url) {
  const u = new URL(url);
  const isLocal = /localhost|127\.0\.0\.1/.test(u.hostname);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    // Aiven & most managed MySQL require TLS.
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    timezone: "Z",
    connectionLimit: 3,
    enableKeepAlive: true,
  };
}

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL missing. .env.local me apna MySQL connection string daalo."
    );
  }
  if (!globalThis.__etsyPool) {
    globalThis.__etsyPool = mysql.createPool(poolConfigFromUrl(url));
  }
  return globalThis.__etsyPool;
}

// Returns { rows } to keep callers DB-agnostic.
export async function query(text, params) {
  const pool = getPool();
  const [rows] = await pool.query(text, params);
  return { rows };
}

// Idempotent schema bootstrap. Runs once per process.
export async function ensureSchema() {
  if (globalThis.__etsySchemaReady) return globalThis.__etsySchemaReady;
  globalThis.__etsySchemaReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS etsy_account (
        etsy_user_id  VARCHAR(64) PRIMARY KEY,
        shop_id       BIGINT,
        shop_name     VARCHAR(255),
        access_token  TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at    BIGINT NOT NULL,
        scopes        VARCHAR(255),
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS app_session (
        session_id   VARCHAR(64) PRIMARY KEY,
        etsy_user_id VARCHAR(64) NOT NULL,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_session_account FOREIGN KEY (etsy_user_id)
          REFERENCES etsy_account(etsy_user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  })();
  return globalThis.__etsySchemaReady;
}
