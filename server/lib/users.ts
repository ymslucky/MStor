import type { Env } from "../env";
import { HttpError } from "./errors";
import { randomToken } from "./crypto";
import { ensureRootDir } from "./nodes";
import { isUniqueViolation } from "./sql";
import type { UserRow } from "../types";

/** Access 身份（JWT 验签通过后的可信字段） */
export interface AccessIdentity {
  sub: string;
  email: string | null;
}

/** 与 logger 对齐的单行 JSON warn（此处无请求上下文，用基础字段） */
function structuredWarn(message: string, fields: Record<string, unknown>) {
  console.warn(JSON.stringify({ level: "warn", message, ...fields }));
}

/**
 * Access 身份 → users 行（唯一建号入口）：
 * ① email 锚点命中（存量承接，含 access_sub 自愈回填）→ ② access_sub 直命中
 * → ③ ACCESS_PROVISION=on 时建号（首个用户 admin，其余 member）；off 时 403 并输出身份供回填。
 * 查询列均有索引，热路径与原会话中间件等价（每请求 1 次 SELECT）。
 */
export async function bindOrProvision(env: Env, ident: AccessIdentity): Promise<UserRow> {
  const db = env.DB;
  if (ident.email) {
    const byEmail = await db.prepare("SELECT * FROM users WHERE email = ?1").bind(ident.email).first<UserRow>();
    if (byEmail) {
      if (byEmail.access_sub === ident.sub) {
        // 旧 OIDC sub 恰好与 Access sub 延续：首次可信登录时确认绑定
        if (byEmail.access_bound_at === null) {
          const confirmedAt = Date.now();
          await db.prepare("UPDATE users SET access_bound_at = ?1 WHERE id = ?2").bind(confirmedAt, byEmail.id).run();
          return { ...byEmail, access_bound_at: confirmedAt };
        }
        return byEmail;
      }
      // 已被 Access 登录确认过的账号不允许因邮箱碰撞被另一个身份静默顶替
      if (byEmail.access_bound_at !== null)
        throw new HttpError(409, "IDENTITY_CONFLICT", "该邮箱已绑定其他 Access 身份");
      // 该 sub 已有归属时不能被 email 锚点抢走；先显式冲突，避免依赖 UNIQUE 错误变成 500
      const subOwner = await db
        .prepare("SELECT id FROM users WHERE access_sub = ?1")
        .bind(ident.sub)
        .first<{ id: string }>();
      if (subOwner) throw new HttpError(409, "IDENTITY_CONFLICT", "该 Access 身份已绑定其他账号");
      // 迁移期旧 OIDC 行：仅允许这一次从 email 锚点回填 Access sub，并记录确认时间
      const boundAt = Date.now();
      await db
        .prepare("UPDATE users SET access_sub = ?1, access_bound_at = ?2 WHERE id = ?3")
        .bind(ident.sub, boundAt, byEmail.id)
        .run();
      structuredWarn("access_bind", { userId: byEmail.id, email: ident.email });
      return { ...byEmail, access_sub: ident.sub, access_bound_at: boundAt };
    }
  }
  const bySub = await db.prepare("SELECT * FROM users WHERE access_sub = ?1").bind(ident.sub).first<UserRow>();
  if (bySub) {
    // 无 email 但 sub 延续的旧 OIDC 行：可信 Access 登录可确认绑定，避免破坏零迁移路径
    if (bySub.access_bound_at === null) {
      const confirmedAt = Date.now();
      await db.prepare("UPDATE users SET access_bound_at = ?1 WHERE id = ?2").bind(confirmedAt, bySub.id).run();
      return { ...bySub, access_bound_at: confirmedAt };
    }
    return bySub;
  }
  if (env.ACCESS_PROVISION !== "on") {
    // 迁移窗口：未知身份不建号，日志输出 sub/email 供管理员回填 email 完成绑定
    structuredWarn("access_unknown_identity", { sub: ident.sub, email: ident.email });
    throw new HttpError(403, "ACCOUNT_NOT_PROVISIONED", "账号未开通，请联系管理员");
  }
  const { n } = (await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())!;
  const role = n === 0 ? "admin" : "member";
  const id = randomToken(12);
  const name = ident.email ? ident.email.split("@")[0] : "user";
  const quota = Number(env.DEFAULT_QUOTA_BYTES);
  const createdAt = Date.now();
  const boundAt = Date.now();
  try {
    await db
      .prepare(
        "INSERT INTO users (id, access_sub, email, access_bound_at, name, role, quota_bytes, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
      )
      .bind(id, ident.sub, ident.email, boundAt, name, role, quota, createdAt)
      .run();
  } catch (e) {
    if (isUniqueViolation(e)) {
      // 并发首登：按 sub 幂等复用；若撞的是 email 唯一索引，则转为显式身份冲突而非 500
      const existing = ident.email
        ? await db
            .prepare("SELECT * FROM users WHERE access_sub = ?1 OR email = ?2")
            .bind(ident.sub, ident.email)
            .first<UserRow>()
        : await db.prepare("SELECT * FROM users WHERE access_sub = ?1").bind(ident.sub).first<UserRow>();
      if (existing) {
        if (existing.access_sub === ident.sub) return existing;
        throw new HttpError(409, "IDENTITY_CONFLICT", "该邮箱已绑定其他 Access 身份");
      }
    }
    throw e;
  }
  await ensureRootDir(db, id);
  return {
    id,
    access_sub: ident.sub,
    email: ident.email,
    access_bound_at: boundAt,
    name,
    role,
    quota_bytes: quota,
    created_at: createdAt,
    disabled_at: null,
  };
}
