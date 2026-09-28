import { beforeEach, expect, test } from "vitest";
import { clearResume, fingerprint, loadResume, saveResume } from "./resume";

beforeEach(() => {
  localStorage.clear();
});

test("fingerprint 由 name/size/lastModified/parentId 组成", () => {
  const f = new File(["x"], "a.bin");
  Object.defineProperty(f, "lastModified", { value: 123 });
  expect(fingerprint(f, "d1")).toBe("a.bin:1:123:d1");
});

test("save/load/clear 往返", () => {
  const fp = "a.bin:10:1:d1";
  saveResume(fp, { uploadId: "up1", partSize: 8, parts: [{ partNumber: 1, etag: '"aa"' }], done: 8 });
  expect(loadResume(fp)).toEqual({
    uploadId: "up1",
    partSize: 8,
    parts: [{ partNumber: 1, etag: '"aa"' }],
    done: 8,
  });
  clearResume(fp);
  expect(loadResume(fp)).toBeNull();
});

test("loadResume 容忍脏数据返回 null", () => {
  localStorage.setItem("mstor_resume", "{broken");
  expect(loadResume("x")).toBeNull();
});

test("最多保留 20 条（LRU by ts）", () => {
  for (let i = 0; i < 25; i++) saveResume(`fp${i}`, { uploadId: `up${i}`, partSize: 8, parts: [], done: 0 });
  const raw = JSON.parse(localStorage.getItem("mstor_resume")!) as Record<string, unknown>;
  expect(Object.keys(raw)).toHaveLength(20);
  expect(loadResume("fp0")).toBeNull(); // 最早的被淘汰
  expect(loadResume("fp24")).not.toBeNull();
});

test("重新 save 同一指纹刷新 LRU 顺序", () => {
  for (let i = 0; i < 20; i++) saveResume(`fp${i}`, { uploadId: `up${i}`, partSize: 8, parts: [], done: 0 });
  saveResume("fp0", { uploadId: "up0", partSize: 8, parts: [], done: 0 }); // 刷新最老的
  saveResume("fp20", { uploadId: "up20", partSize: 8, parts: [], done: 0 });
  expect(loadResume("fp0")).not.toBeNull();
  expect(loadResume("fp1")).toBeNull(); // fp1 成为最老被淘汰
});
