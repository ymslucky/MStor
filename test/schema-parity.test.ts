import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import schemaSql from "../sql/schema.sql?raw";

// schema.sql（全新环境建库）与 migrations（既有环境增量）必须保持等价，
// 否则会出现「新库与旧库结构漂移」的隐性不一致。本测试在迁移构建出的库上做双向比对。

/** 解析常规表 → 列名列表（忽略 PRIMARY/FOREIGN/UNIQUE/CHECK/CONSTRAINT 等表级约束行） */
function parseTables(sql: string): Map<string, string[]> {
  const stripped = sql.replace(/--[^\n]*/g, "");
  const tables = new Map<string, string[]>();
  const re = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    const cols: string[] = [];
    for (const rawLine of m[2].split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const first = line.split(/[\s(]/)[0];
      if (!first) continue;
      if (["PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT"].includes(first.toUpperCase())) continue;
      cols.push(first);
    }
    tables.set(m[1], cols);
  }
  return tables;
}

/** 解析所有显式索引名（含 UNIQUE INDEX） */
function parseIndexNames(sql: string): Set<string> {
  const names = new Set<string>();
  const re = /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS (\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) names.add(m[1]);
  return names;
}

const EXPECTED_TABLES = ["users", "nodes", "shares", "uploads", "settings", "orphan_objects", "nodes_fts"];

test("schema.sql 与 migrations 建出的表结构一致", async () => {
  const parsed = parseTables(schemaSql);
  expect(parsed.size).toBeGreaterThan(0);
  for (const [table, cols] of parsed) {
    const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const actual = info.results.map((r) => r.name);
    expect(new Set(actual), `表 ${table} 列不一致`).toEqual(new Set(cols));
  }
});

test("schema.sql 声明的表均在迁移库中存在", async () => {
  for (const t of EXPECTED_TABLES) {
    const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE name = ?1").bind(t).first<{ name: string }>();
    expect(row, `表 ${t} 缺失`).toBeTruthy();
  }
});

test("索引双向一致：schema.sql 声明的索引都存在，迁移库无多余索引", async () => {
  const declared = parseIndexNames(schemaSql);
  expect(declared.size).toBeGreaterThan(0);

  for (const idx of declared) {
    const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?1").bind(idx).first<{ name: string }>();
    expect(row, `索引 ${idx} 在迁移库中缺失`).toBeTruthy();
  }

  const dbIndexes = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").all<{ name: string }>();
  for (const r of dbIndexes.results) {
    expect(declared.has(r.name), `迁移库中存在 schema.sql 未声明的索引：${r.name}`).toBe(true);
  }
});