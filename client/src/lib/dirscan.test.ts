import { expect, test } from "vitest";
import { collectUploads } from "./dirscan";

// —— 测试用假 entry/dt（jsdom 无 DataTransfer 与 webkitGetAsEntry）——
function fakeFile(name: string, content = "x"): File {
  return new File([content], name, { type: "text/plain" });
}

function fileEntry(file: File) {
  return {
    isFile: true,
    isDirectory: false,
    file: (cb: (f: File) => void) => cb(file),
  } as unknown as FileSystemEntry;
}

/** 目录 entry：readEntries 按 batches 依次返回（模拟每次最多 100 条）。
 * 注意 readEntries 必须先自增再回调：真实 API 回调是异步的，而 dirscan 同步递归读取 */
function dirEntry(name: string, children: FileSystemEntry[], batches?: number) {
  let calls = 0;
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({
      readEntries: (cb: (b: FileSystemEntry[]) => void) => {
        if (!batches) {
          const first = calls++ === 0;
          return cb(first ? children : []);
        }
        const batch = calls < batches ? children.slice(calls * 2, calls * 2 + 2) : [];
        calls++;
        cb(batch);
      },
    }),
  } as unknown as FileSystemEntry;
}

function fakeDt(entries: (FileSystemEntry | null)[], files: File[] = []) {
  return {
    items: entries.map((entry) => ({ webkitGetAsEntry: () => entry })),
    files,
  } as unknown as DataTransfer;
}

test("collects top-level files with path = file name (no dirs to create)", async () => {
  const out = await collectUploads(fakeDt([fileEntry(fakeFile("a.txt")), fileEntry(fakeFile("b.png"))]));
  expect(out.map((u) => ({ name: u.file.name, path: u.path }))).toEqual([
    { name: "a.txt", path: "a.txt" },
    { name: "b.png", path: "b.png" },
  ]);
});

test("walks nested directories preserving structure", async () => {
  const tree = dirEntry("photos", [
    fileEntry(fakeFile("a.jpg")),
    dirEntry("2024", [fileEntry(fakeFile("b.jpg"))]),
  ]);
  const out = await collectUploads(fakeDt([tree]));
  expect(out.map((u) => u.path)).toEqual(["photos/a.jpg", "photos/2024/b.jpg"]);
  expect(out[1].file.name).toBe("b.jpg");
});

test("handles mixed drop: file entry + directory entry", async () => {
  const out = await collectUploads(fakeDt([fileEntry(fakeFile("top.txt")), dirEntry("d", [fileEntry(fakeFile("in.txt"))])]));
  expect(out.map((u) => u.path)).toEqual(["top.txt", "d/in.txt"]);
});

test("repeated readEntries batches are drained until empty", async () => {
  const f1 = fileEntry(fakeFile("1.txt"));
  const f2 = fileEntry(fakeFile("2.txt"));
  const f3 = fileEntry(fakeFile("3.txt"));
  const f4 = fileEntry(fakeFile("4.txt"));
  const tree = dirEntry("d", [f1, f2, f3, f4], 2); // 每批 2 条，共 2 批
  const out = await collectUploads(fakeDt([tree]));
  expect(out.map((u) => u.path)).toEqual(["d/1.txt", "d/2.txt", "d/3.txt", "d/4.txt"]);
});

test("falls back to dt.files when entries are unavailable or null", async () => {
  const f = fakeFile("fallback.bin");
  const out = await collectUploads(fakeDt([null, null], [f]));
  expect(out).toHaveLength(1);
  expect(out[0].file.name).toBe("fallback.bin");
  expect(out[0].path).toBeUndefined();
});

test("empty drop yields empty list", async () => {
  expect(await collectUploads(fakeDt([], []))).toEqual([]);
});
