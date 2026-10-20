#!/usr/bin/env node
/**
 * Schema 2.0 本地校验：用 node:sqlite 内存库执行 sql/v2/schema.sql，并断言不变量。
 * 目的：在没有 wrangler/workerd 的环境里也能验证 DDL 与关键约束（D1 是 SQLite，语义一致）。
 * 用法：npm run check:schema
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(new URL("../sql/v2/schema.sql", import.meta.url));
const sql = readFileSync(schemaPath, "utf8");

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log("  ok    " + name); }
  catch (e) { failures.push(name + ": " + e.message); console.log("  FAIL  " + name + " — " + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(msg + "（实际 " + JSON.stringify(actual) + "）");
}
function assertThrows(fn, msg) { try { fn(); } catch { return; } throw new Error(msg + "（未抛错）"); }

// FTS5/trigram 单独探测：node:sqlite 的 SQLite 构建若不支持，建表会在下方整体失败，先给出明确原因
const probe = new DatabaseSync(":memory:");
let ftsStatus = "ok";
try { probe.exec("CREATE VIRTUAL TABLE t USING fts5(x, tokenize='trigram')"); }
catch (e) { ftsStatus = "unavailable: " + e.message; }
probe.close();
console.log("node:sqlite FTS5/trigram: " + ftsStatus);

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
db.exec(sql);
const now = Date.now();

const EXPECTED_TABLES = ["users","workspaces","memberships","invitations","nodes","shares","share_downloads","uploads","file_versions","audit_events","storage_stats","settings","orphan_objects","nodes_fts"];
const EXPECTED_INDEXES = ["idx_users_email","idx_memberships_user","idx_invitations_pending","idx_nodes_root","idx_nodes_name_active","idx_nodes_listing","idx_nodes_name","idx_nodes_path","idx_nodes_sha","idx_nodes_r2key","idx_nodes_trash","idx_nodes_thumb","idx_shares_node","idx_shares_active","idx_share_downloads","idx_share_downloads_dedupe","idx_uploads_idem","idx_uploads_open","idx_versions_no","idx_versions_node","idx_versions_key","idx_versions_expire","idx_audit_ws_time","idx_orphan_queued"];

check("全量 DDL 可执行且表齐全", () => {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  const missing = EXPECTED_TABLES.filter((t) => !names.includes(t));
  assertEqual(missing, [], "缺失表");
});
check("索引齐全", () => {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name);
  const missing = EXPECTED_INDEXES.filter((i) => !names.includes(i));
  assertEqual(missing, [], "缺失索引");
});

// 种子
db.prepare("INSERT INTO users (id, access_sub, email, name, created_at) VALUES ('u1','sub-1','a@example.com','A',?)").run(now);
db.prepare("INSERT INTO users (id, access_sub, name, created_at) VALUES ('u2','sub-2','B',?)").run(now);
db.prepare("INSERT INTO workspaces (id, name, slug, quota_bytes, created_at) VALUES ('w1','家','home',1000,?)").run(now);
db.prepare("INSERT INTO workspaces (id, name, slug, quota_bytes, created_at) VALUES ('w2','团队','team',1000,?)").run(now);
db.prepare("INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES ('w1','u1','owner',?)").run(now);
const insertNode = db.prepare("INSERT INTO nodes (id, workspace_id, created_by, parent_id, path, name, is_dir, r2_key, size, mime, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
insertNode.run("root-w1","w1","u1","","/","",1,null,null,null,now,now);

check("外键生效：未知 workspace 的节点被拒绝", () => {
  assertThrows(() => insertNode.run("x","nope","u1","root-w1","/root-w1/","a.txt",0,"k",1,"text/plain",now,now), "未知 workspace 应被外键拒绝");
});
check("根哨兵每个 workspace 至多一行", () => {
  assertThrows(() => insertNode.run("root2-w1","w1","u1","","/","",1,null,null,null,now,now), "第二个根哨兵应被拒绝");
  insertNode.run("root-w2","w2","u2","","/","",1,null,null,null,now,now);
});
check("同名活跃节点唯一，回收站同名不占名", () => {
  insertNode.run("n1","w1","u1","root-w1","/root-w1/","report.pdf",0,"k1",10,"application/pdf",now,now);
  assertThrows(() => insertNode.run("n2","w1","u1","root-w1","/root-w1/","report.pdf",0,"k2",10,"application/pdf",now,now), "活跃同名应被拒绝");
  db.prepare("UPDATE nodes SET deleted_at = ? WHERE id = 'n1'").run(now);
  insertNode.run("n2","w1","u1","root-w1","/root-w1/","report.pdf",0,"k2",10,"application/pdf",now,now);
});
check("物化路径不变量：子树前缀可区间扫描", () => {
  insertNode.run("d1","w1","u1","root-w1","/root-w1/","docs",1,null,null,null,now,now);
  insertNode.run("n3","w1","u1","d1","/root-w1/d1/","a.txt",0,"k3",3,"text/plain",now,now);
  const sub = db.prepare("SELECT id FROM nodes WHERE workspace_id='w1' AND path >= ? AND path < ? ORDER BY path").all("/root-w1/d1/","/root-w1/d1/g").map((r) => r.id);
  assertEqual(sub, ["n3"], "d1 的后代应为 n3");
});
check("配额原子更新：超限时不写入", () => {
  const inc = () => db.prepare("UPDATE workspaces SET used_bytes = used_bytes + ?1 WHERE id = 'w1' AND used_bytes + ?1 <= quota_bytes").run(200).changes;
  assertEqual(inc(), 1, "200 字节应写入");
  for (let i = 0; i < 4; i += 1) inc();
  assertEqual(inc(), 0, "超过 quota 必须失败");
  assertEqual(db.prepare("SELECT used_bytes FROM workspaces WHERE id='w1'").get().used_bytes, 1000, "used_bytes 应停在 quota");
});
check("分享下载上限原子扣减 + 撤销", () => {
  db.prepare("INSERT INTO shares (id, workspace_id, node_id, token, max_downloads, created_at) VALUES ('s1','w1','n2','tok',1,?)").run(now);
  const take = () => db.prepare("UPDATE shares SET downloads = downloads + 1 WHERE id='s1' AND revoked_at IS NULL AND (max_downloads IS NULL OR downloads < max_downloads)").run().changes;
  assertEqual(take(), 1, "第一次下载应成功");
  assertEqual(take(), 0, "第二次应被 max_downloads 拒绝");
});
check("删除 workspace：nodes 不级联（防止 R2 孤儿），成员与统计级联", () => {
  db.prepare("INSERT INTO storage_stats (workspace_id) VALUES ('w2')").run();
  db.prepare("INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES ('w2','u2','owner',?)").run(now);
  // nodes 刻意不设 ON DELETE CASCADE：直接删租户会被外键挡住，必须在应用层先清对象再删行
  assertThrows(() => db.prepare("DELETE FROM workspaces WHERE id = 'w2'").run(), "仍有 nodes 时删除 workspace 应被拒绝");
  db.prepare("DELETE FROM nodes WHERE workspace_id = 'w2'").run();
  db.prepare("DELETE FROM workspaces WHERE id = 'w2'").run();
  assertEqual(db.prepare("SELECT COUNT(*) AS c FROM storage_stats WHERE workspace_id='w2'").get().c, 0, "storage_stats 应级联删除");
  assertEqual(db.prepare("SELECT COUNT(*) AS c FROM memberships WHERE workspace_id='w2'").get().c, 0, "memberships 应级联删除");
});
check("版本号在节点内唯一", () => {
  db.prepare("INSERT INTO file_versions (id, workspace_id, node_id, version_no, r2_key, size, created_by, created_at) VALUES ('v1','w1','n2',1,'k2',10,'u1',?)").run(now);
  assertThrows(() => db.prepare("INSERT INTO file_versions (id, workspace_id, node_id, version_no, r2_key, size, created_by, created_at) VALUES ('v2','w1','n2',1,'k2',10,'u1',?)").run(now), "同节点同版本号应被拒绝");
});
if (ftsStatus === "ok") {
  check("文件名 FTS 触发器：插入/改名/删除同步，目录不入索引", () => {
    const hit = (q) => db.prepare("SELECT rowid FROM nodes_fts WHERE nodes_fts MATCH ?").all(q).length;
    insertNode.run("n5","w1","u1","root-w1","/root-w1/","quarterly-report.pdf",0,"k5",5,"application/pdf",now,now);
    assert(hit("quarterly") > 0, "插入后可检索到 quarterly");
    assertEqual(hit("docs"), 0, "目录名不应入索引");
    db.prepare("UPDATE nodes SET name = 'annual-summary.pdf' WHERE id = 'n5'").run();
    assertEqual(hit("quarterly"), 0, "改名后旧名应消失");
    assert(hit("summary") > 0, "改名后新名应可检索");
    db.prepare("DELETE FROM nodes WHERE id = 'n5'").run();
    assertEqual(hit("summary"), 0, "删除后索引应清理");
  });
  check("软删不触发 FTS delete：搜索必须 join nodes 并过滤 deleted_at", () => {
    // 独立 token，避免与活跃节点的同名命中混淆
    insertNode.run("n6","w1","u1","root-w1","/root-w1/","trashonly.pdf",0,"k6",7,"application/pdf",now,now);
    db.prepare("UPDATE nodes SET deleted_at = ? WHERE id = 'n6'").run(now);
    const raw = db.prepare("SELECT COUNT(*) AS c FROM nodes_fts WHERE nodes_fts MATCH ?").get("trashonly").c;
    // FTS5 的 MATCH 必须写表名本身，不能写别名
    const live = db.prepare("SELECT COUNT(*) AS c FROM nodes_fts JOIN nodes n ON n.rowid = nodes_fts.rowid WHERE nodes_fts MATCH ? AND n.deleted_at IS NULL").get("trashonly").c;
    assertEqual(raw, 1, "软删行的 FTS 行应保留（external content 语义）");
    assertEqual(live, 0, "join 并过滤 deleted_at 后不应查到回收站内容");
  });
} else {
  console.log("  skip  文件名 FTS 断言（本机 SQLite 无 FTS5/trigram，D1 侧仍需一次真实执行验证）");
}

console.log("\n" + (failures.length === 0 ? "全部通过： " + passed + " 项" : "失败 " + failures.length + " 项：\n" + failures.join("\n")));
process.exit(failures.length === 0 ? 0 : 1);
