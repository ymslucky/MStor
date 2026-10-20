/**
 * D1 访问助手（方案 §4.6 批量操作规范的落点）。
 *
 * 现状问题（已实测，见 npm run check:schema 的批量段）：id 列表一律拆成 `IN (?,?,…)` 且每片 ≤90 参数，
 * 500 项操作会膨胀成 41 条（软删）到上千条（孤儿清扫）语句。D1 的单语句参数上限是 100，绕开它的
 * 正确方式不是"多分几片"，而是一次绑定 JSON 数组、由 `json_each()` 在 SQL 里展开——语句数因此与批次无关。
 */

/** D1/SQLite 单语句绑定参数硬上限（不是配额；超限直接报 too many SQL variables） */
export const SQL_PARAM_LIMIT = 100;

/** 把 id/字符串列表编码成单个绑定参数（配合 {@link jsonSet} 使用） */
export function jsonList(values: readonly string[]): string {
  return JSON.stringify(values);
}

/**
 * 「列表包含」谓词：`id IN (SELECT value FROM json_each(?))`。
 * 调用方需为该片段单独绑定一个 JSON 字符串参数（见 {@link jsonList}），参数个数恒为 1。
 */
export function jsonSet(): string {
  return "(SELECT value FROM json_each(?))";
}

/** UNIQUE 冲突判定：仅此一处认识 SQLite 的错误文案 */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && e.message.includes("UNIQUE constraint failed");
}

/**
 * 多语句原子写入：D1 `batch()` 是单次往返 + 隐式事务，任一句失败整体回滚。
 * 批量写操作（删行 + 配额 + 审计）必须走这里，不要逐条 `run()`。
 */
export async function runBatch(db: D1Database, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  if (!stmts.length) return [];
  return db.batch(stmts);
}
