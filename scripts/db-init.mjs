import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.log("[db:init] DATABASE_URL is not configured; skipping database initialization.");
  process.exit(0);
}

const schemaPath = resolve(process.cwd(), "database", "schema.sql");
const schema = await readFile(schemaPath, "utf8");
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15_000 });

try {
  await pool.query(schema);
  console.log("[db:init] MealPoint schema is ready.");
} catch (error) {
  console.error("[db:init] Database initialization failed.", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
