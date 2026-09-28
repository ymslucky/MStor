// 动态配置（settings 表）：admin 设置页写入，读取方自行决定 env 回退
export async function getSetting(env: { DB: D1Database }, key: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}
