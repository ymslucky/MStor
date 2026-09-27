import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError, errors } from "./errors";
import type { NodeRow } from "../types";

// 上传 mime 完全由客户端控制：内联 text/html 等会造成存储型 XSS，强制 attachment
const UNSAFE_INLINE = ["text/html", "image/svg+xml", "application/xhtml+xml"];

export async function serveObject(c: Context<AppEnv>, node: NodeRow): Promise<Response> {
  if (!node.r2_key) throw errors.notFound();
  const mime = (node.mime ?? "application/octet-stream").toLowerCase();
  const bare = mime.split(";")[0].trim();
  const disposition = c.req.query("dl") === "1" || UNSAFE_INLINE.includes(bare) ? "attachment" : "inline";
  const base: Record<string, string> = {
    "content-type": node.mime ?? "application/octet-stream",
    "accept-ranges": "bytes",
    etag: `"${node.id}"`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
    "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(node.name)}`,
  };
  const rangeHeader = c.req.header("range");
  if (!rangeHeader) {
    const obj = await c.env.BUCKET.get(node.r2_key);
    if (!obj) throw errors.notFound();
    return new Response(obj.body, { status: 200, headers: { ...base, "content-length": String(obj.size) } });
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!m || (m[1] === "" && m[2] === "")) throw new HttpError(416, "RANGE_INVALID", "Range 不合法");
  const size = node.size ?? 0;
  let offset: number;
  let length: number | undefined;
  if (m[1] === "") {
    // 后缀语义 bytes=-N：最后 N 字节
    length = Math.min(Number(m[2]), size);
    offset = size - length;
  } else {
    offset = Number(m[1]);
    length = m[2] === "" ? undefined : Number(m[2]) - offset + 1;
  }
  if (offset >= size || (length !== undefined && length <= 0)) throw new HttpError(416, "RANGE_INVALID", "Range 越界");
  const obj = await c.env.BUCKET.get(node.r2_key, { range: { offset, length } });
  if (!obj) throw errors.notFound();
  // 不依赖 R2 range get 返回的 obj.size 语义，用计算出的 length 推导
  const actualLen = length ?? size - offset;
  const end = offset + actualLen - 1;
  return new Response(obj.body, {
    status: 206,
    headers: { ...base, "content-range": `bytes ${offset}-${end}/${size}`, "content-length": String(actualLen) },
  });
}
