export interface PendingUpload {
  file: File;
  /** 相对上传根的路径（含文件名），如 "photos/2024/a.jpg"；顶层文件与回退分支省略 */
  path?: string;
}

/**
 * 从拖放的 DataTransfer 采集上传项，目录递归展开并保留结构。
 * 注意：DataTransfer 在事件处理器让出（await）后会失效，
 * 因此本函数必须在首个 await 前同步取完全部 entries —— 实现为第一行同步收集。
 */
export async function collectUploads(dt: DataTransfer | null): Promise<PendingUpload[]> {
  const entries = Array.from(dt?.items ?? [], (item) => item.webkitGetAsEntry?.() ?? null);
  // 浏览器不支持 entries（或全部为 null）时回退平铺文件列表
  if (!entries.some(Boolean)) {
    return Array.from(dt?.files ?? []).map((file) => ({ file }));
  }
  const out: PendingUpload[] = [];
  for (const entry of entries) {
    if (entry) await walk(entry, "", out);
  }
  return out;
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

// readEntries 单批最多返回约 100 条，必须循环读到空批才算取完
function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const step = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        step();
      }, reject);
    step();
  });
}

async function walk(entry: FileSystemEntry, prefix: string, out: PendingUpload[]): Promise<void> {
  if (entry.isFile) {
    const file = await fileOf(entry as FileSystemFileEntry);
    out.push({ file, path: prefix + file.name });
    return;
  }
  if (entry.isDirectory) {
    const children = await readAll((entry as FileSystemDirectoryEntry).createReader());
    for (const child of children) await walk(child, `${prefix}${entry.name}/`, out);
  }
}
