// One-off: verify DB connectivity + create schema. Run: node scripts/dbcheck.mjs
import mysql from "mysql2/promise";
import fs from "node:fs";

// read DATABASE_URL from .env.local
const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) throw new Error("DATABASE_URL not found in .env.local");
const url = new URL(m[1].trim());

const conn = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

await conn.query(`
  CREATE TABLE IF NOT EXISTS etsy_account (
    etsy_user_id VARCHAR(64) PRIMARY KEY,
    shop_id BIGINT, shop_name VARCHAR(255),
    access_token TEXT NOT NULL, refresh_token TEXT NOT NULL,
    expires_at BIGINT NOT NULL, scopes VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB;
`);
await conn.query(`
  CREATE TABLE IF NOT EXISTS app_session (
    session_id VARCHAR(64) PRIMARY KEY,
    etsy_user_id VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_session_account FOREIGN KEY (etsy_user_id)
      REFERENCES etsy_account(etsy_user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB;
`);

const [tables] = await conn.query("SHOW TABLES");
console.log("OK connected. Tables:", tables.map((t) => Object.values(t)[0]));
await conn.end();
