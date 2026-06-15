import { pool } from "../db.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, "../../../../db/migrate_gemini.sql");

async function main() {
  console.log("==> Застосування міграції Gemini з Node.js...");
  try {
    const sql = fs.readFileSync(sqlPath, "utf-8");
    await pool.query(sql);
    console.log("✅ Міграцію Gemini успішно застосовано!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Не вдалося застосувати міграцію Gemini:", err);
    process.exit(1);
  }
}

void main();
