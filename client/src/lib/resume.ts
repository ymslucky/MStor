// 断点续传本地记录：大文件暂停/失败后保留 uploadId 与已传分片，
// 重试或刷新页面重传同文件时跳过已传分片（服务端 uploads 表 status='pending' 期间分片仍有效）。

import type { Part } from "../api/uploads";

const KEY = "mstor_resume";
const MAX_ENTRIES = 20;

export interface ResumeRecord {
  uploadId: string;
  partSize: number;
  parts: Part[];
  /** 已传分片累计字节（进度基数） */
  done: number;
}

/** 文件指纹：同名同大小同修改时间同目录视为可续传 */
export function fingerprint(file: File, parentId: string): string {
  return `${file.name}:${file.size}:${file.lastModified}:${parentId}`;
}

function readAll(): Map<string, ResumeRecord> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, ResumeRecord>));
  } catch {
    return new Map();
  }
}

function writeAll(map: Map<string, ResumeRecord>) {
  // LRU：超过上限按插入/刷新顺序淘汰最早的（Map 保持插入序，重新 save 即刷新）
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    // 存储满/隐私模式：续传不可用但不影响上传
  }
}

export function loadResume(fp: string): ResumeRecord | null {
  return readAll().get(fp) ?? null;
}

export function saveResume(fp: string, rec: ResumeRecord) {
  const map = readAll();
  map.delete(fp);
  map.set(fp, rec);
  writeAll(map);
}

export function clearResume(fp: string) {
  const map = readAll();
  if (!map.delete(fp)) return;
  writeAll(map);
}
