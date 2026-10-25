/**
 * SQL 访问助手。
 *
 * 现状问题（实测见 npm run test:server:local）：id 列表一律拆成 `IN (?,?,…)` 且每片 ≤90 参数，
 * 500 项操作会膨胀成几十到上千条语句。D1 单语句参数硬上限是 100，绕开它的正确方式不是"多分几片"，
 * 而是一次绑定 JSON 数组、由 `json_each()` 在 SQL 里展开——语句数因此与批次大小无关。
 *
 * 放在 lib/ 而不是 data/：这些是零依赖的工具，lib 与 routes 都要用；data/ 将来只放真正的数据访问。
 */

/** D1/SQLite 单语句绑定参数硬上限（不是配额；超限报 too many SQL variables） */
export const SQL_PARAM_LIMIT = 100;

/** nodes 的 TEXT PRIMARY KEY 自动索引名。
 * json_each 的 IN 子查询会被 planner 误判为「先按 workspace 全扫」；
 * 纯 id 集合查询显式 INDEXED BY 强制主键点查（生产实测 328 行读 → 9 行读）。 */
export const NODES_PK_INDEX = "sqlite_autoindex_nodes_1";

/** 目录子树区间每语句最多 32 个：每个目录消耗 3 个绑定参数（自身 id + 区间 lo/hi） */
export const DIRS_PER_STMT = 32;

/** 把列表编码成单个绑定参数（配合 {@link jsonSet} 使用） */
export function jsonList(values: readonly string[]): string {
  return JSON.stringify(values);
}

/** 「列表包含」谓词：`col IN (SELECT value FROM json_each(?))`，参数个数恒为 1 */
export function jsonSet(): string {
  return "(SELECT value FROM json_each(?))";
}

/** UNIQUE 冲突判定：SQLite 错误文案只在这里认识一次 */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && e.message.includes("UNIQUE constraint failed");
}

/** 定长切片（仅用于「每条语句 SQL 结构不同、无法合并」的场景，如目录区间语句） */
export function chunk<T>(arr: T[], n: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += n) batches.push(arr.slice(i, n + i));
  return batches;
}

/**
 * 多语句原子写入：D1 `batch()` 是单次往返 + 隐式事务，任一句失败整体回滚。
 * 批量写操作（删行 + 配额 + 审计）走这里，不要逐条 `run()`。
 */
export async function runBatch(db: D1Database, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  if (!stmts.length) return [];
  return db.batch(stmts);
}
