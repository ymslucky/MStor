#!/usr/bin/env node
/**
 * 迁移链干跑（生产迁移前的最后一道本地保险）：
 *   1) 在 node:sqlite 内存库里按文件名顺序执行 migrations/*.sql
 *   2) 在另一个内存库里执行 sql/schema.sql（全新环境建库）
 *   3) 对比两边的表与索引集合，必须完全一致
 * 这样能在没有 wrangler/workerd 的环境里验证「迁移路径」与「全量建库」等价。
 */
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "migrations");

function objects(db) {
  const rows = db
    .prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','index','trigger','view')")
    .all();
  return new Set(rows.map((r) => r.type + ":" + r.name));
}

function buildFromMigrations() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    try {
      db.exec(sql);
    } catch (e) {
      throw new Error("迁移 " + file + " 执行失败: " + e.message);
    }
  }
  return { db, files };
}

function buildFromSchema() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(join(root, "sql/schema.sql"), "utf8"));
  return db;
}

const { db: migrated, files } = buildFromMigrations();
const fresh = buildFromSchema();
const a = objects(migrated);
const b = objects(fresh);

const onlyMigrated = [...a].filter((x) => !b.has(x));
const onlyFresh = [...b].filter((x) => !a.has(x));

console.log("迁移文件数: " + files.length + "（" + files[0] + " … " + files[files.length - 1] + "）");
console.log("迁移产物对象数: " + a.size + "，全量建库对象数: " + b.size);

if (onlyMigrated.length === 0 && onlyFresh.length === 0) {
  console.log("✅ 迁移链与 sql/schema.sql 完全等价");
  process.exit(0);
}
console.error("❌ 迁移链与全量建库不一致");
if (onlyMigrated.length) console.error("  仅迁移路径有: " + onlyMigrated.join(", "));
if (onlyFresh.length) console.error("  仅全量建库有: " + onlyFresh.join(", "));
process.exit(1);
