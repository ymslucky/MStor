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
  // RFC 5987 attr-char 之外的字元：encodeURIComponent 不转义 !'()*，这里补齐
  const encodedName = encodeURIComponent(node.name).replace(/[!'()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase());
  const base: Record<string, string> = {
    "content-type": node.mime ?? "application/octet-stream",
    "accept-ranges": "bytes",
    etag: `"${node.id}"`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
    "cache-control": "private, no-cache",
    "content-disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
  };
  // 缩略图方案（近似）：图片内容不可变（同名修改=新 node 新 key），网格视图直接以原图作缩略图，
  // 配合一年 immutable 强缓存 + 前端 loading="lazy"，回访秒开且不重复拉流量。
  // 真缩略图（省流量）需 Cloudflare 付费 Image Resizing，届时在 fetch 上加：
  //   cf: { image: { width: 256, fit: "cover" } } —— 代码预留钩子。
  if (bare.startsWith("image/")) base["cache-control"] = "private, max-age=31536000, immutable";
  // 不可解析的 Range 视为不存在（RFC 9110），回落全量 200；语法合法但空范围（bytes=-）才 416
  const rangeHeader = c.req.header("range")?.toLowerCase();
  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader) : null;
  if (m && m[1] === "" && m[2] === "") throw new HttpError(416, "RANGE_INVALID", "Range 不合法");
  const size = node.size ?? 0;
  let offset = 0;
  let length: number | undefined;
  let range: { offset: number; length?: number } | undefined;
  if (m) {
    if (m[1] === "") {
      // 后缀语义 bytes=-N：最后 N 字节
      length = Math.min(Number(m[2]), size);
      offset = size - length;
    } else {
      offset = Number(m[1]);
      // end >= size 按剩余全部解释（RFC 9110），钳制而非谎报 content-length
      length = m[2] === "" ? undefined : Math.min(Number(m[2]) - offset + 1, size - offset);
    }
    if (offset >= size || (length !== undefined && length <= 0)) throw new HttpError(416, "RANGE_INVALID", "Range 越界");
    range = length !== undefined ? { offset, length } : { offset };
  }
  const obj = range ? await c.env.BUCKET.get(node.r2_key, { range }) : await c.env.BUCKET.get(node.r2_key);
  if (!obj) throw errors.notFound();
  if (!range) return new Response(obj.body, { status: 200, headers: { ...base, "content-length": String(obj.size) } });
  // 不依赖 R2 range get 返回的 obj.size 语义，用计算出的 length 推导
  const actualLen = length ?? size - offset;
  const end = offset + actualLen - 1;
  return new Response(obj.body, {
    status: 206,
    headers: { ...base, "content-range": `bytes ${offset}-${end}/${size}`, "content-length": String(actualLen) },
  });
}
