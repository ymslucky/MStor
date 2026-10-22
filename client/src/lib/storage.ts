// 客户端本地存储集中管理：统一键名（避免各处字符串字面量漂移）与读写容错（隐私模式/存储满不抛错）。

/** localStorage 键：持久化用户偏好与本地会话标记 */
export const STORAGE_KEYS = {
  sidebar: "mstor_sidebar",
  view: "mstor_view",
  actAs: "mstor_act_as",
  workspace: "mstor_workspace",
  filesTable: "mstor_files_table",
  uploadConcurrency: "mstor_upload_concurrency",
  resume: "mstor_resume",
  uploadConflict: "mstor_upload_conflict",
  skin: "mstor_skin",
  density: "mstor_density",
} as const;

/** sessionStorage 键：仅当前标签页生命周期有效（会话标记与续期守卫） */
export const SESSION_KEYS = {
  authed: "mstor_authed",
  renewAt: "mstor_renew_at",
} as const;

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function ss(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function getString(key: string): string | null {
  try {
    return ls()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setString(key: string, value: string): void {
  try {
    ls()?.setItem(key, value);
  } catch {
    /* 隐私模式 / 存储满：忽略 */
  }
}

export function removeItem(key: string): void {
  try {
    ls()?.removeItem(key);
  } catch {
    /* 同上 */
  }
}

/** 读取并 JSON 解析；缺失或解析失败返回 fallback */
export function getJSON<T>(key: string, fallback: T): T {
  const raw = getString(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJSON(key: string, value: unknown): void {
  setString(key, JSON.stringify(value));
}

// —— sessionStorage（会话标记）——
export function getSession(key: string): string | null {
  try {
    return ss()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setSession(key: string, value: string): void {
  try {
    ss()?.setItem(key, value);
  } catch {
    /* 同上 */
  }
}

export function removeSession(key: string): void {
  try {
    ss()?.removeItem(key);
  } catch {
    /* 同上 */
  }
}