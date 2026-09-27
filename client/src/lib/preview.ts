export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "none";

export function previewKind(mime: string | null | undefined): PreviewKind {
  const m = (mime ?? "").split(";")[0].trim();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("text/") || m === "application/json") return "text";
  return "none";
}
