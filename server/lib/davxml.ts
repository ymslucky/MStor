// PROPFIND multistatus XML 构造。
// href 是 URI：先百分号编码（空格/非 ASCII），再转义 XML 实体；displayname 保持原文字面量只做实体转义。
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[m]!);
}

export const LOCK_TOKEN = "opaquelocktoken:mstor-fake-lock";

export function propResponse(href: string, node: {
  is_dir: 0 | 1; name: string; size: number | null; mime: string | null; updated_at: number;
}): string {
  const isDir = !!node.is_dir;
  const rtype = isDir ? "<D:resourcetype><D:collection/></D:resourcetype>" : "<D:resourcetype/>";
  const fileProps = isDir
    ? ""
    : `<D:getcontentlength>${node.size ?? 0}</D:getcontentlength><D:getcontenttype>${escapeXml(node.mime ?? "application/octet-stream")}</D:getcontenttype>`;
  return (
    `<D:response><D:href>${escapeXml(encodeURI(href))}</D:href><D:propstat><D:prop>${rtype}${fileProps}` +
    `<D:displayname>${escapeXml(node.name)}</D:displayname>` +
    `<D:getlastmodified>${new Date(node.updated_at).toUTCString()}</D:getlastmodified>` +
    `<D:creationdate>${new Date(node.updated_at).toISOString()}</D:creationdate>` +
    `<D:supportedlock><D:entry><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:entry></D:supportedlock>` +
    `<D:lockdiscovery><D:activelock><D:locktoken><D:href>${LOCK_TOKEN}</D:href></D:locktoken></D:activelock></D:lockdiscovery>` +
    `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`
  );
}

export function multistatus(responses: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${responses.join("")}</D:multistatus>`;
}
