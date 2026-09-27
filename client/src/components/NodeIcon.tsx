import { FileArchive, FileCode, FileImage, FileText, FileVideo, Folder } from "lucide-react";

// mime → Lucide 类型图标：文件夹 Folder，文件按 mime 大类映射（未知类型兜底 FileText）
function resolveIcon(node: { is_dir: 0 | 1; mime: string | null }) {
  if (node.is_dir) return Folder;
  const mime = node.mime ?? "";
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return FileVideo;
  if (/zip|tar|rar|7z|gzip|compressed/.test(mime)) return FileArchive;
  if (/javascript|json|xml|html|css/.test(mime)) return FileCode;
  return FileText;
}

// 颜色随类型走（设计系统 chip/主色档），调用方只管布局类
function resolveColor(node: { is_dir: 0 | 1; mime: string | null }) {
  if (node.is_dir) return "text-primary-text";
  const mime = node.mime ?? "";
  if (mime.startsWith("image/")) return "text-cta-text";
  if (mime.startsWith("video/")) return "text-chip-violet-fg";
  if (/zip|tar|rar|7z|gzip|compressed/.test(mime)) return "text-chip-amber-fg";
  if (/javascript|json|xml|html|css/.test(mime)) return "text-success-text";
  return "text-ink-2";
}

export function NodeIcon({
  node,
  size = 18,
  className = "",
}: {
  node: { is_dir: 0 | 1; mime: string | null };
  size?: number;
  className?: string;
}) {
  const Icon = resolveIcon(node);
  return <Icon size={size} aria-hidden className={`${resolveColor(node)} ${className}`} />;
}
