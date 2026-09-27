import { expect, test } from "vitest";
import { previewKind } from "./preview";

test("maps mime to preview kind", () => {
  expect(previewKind("image/png")).toBe("image");
  expect(previewKind("video/mp4")).toBe("video");
  expect(previewKind("audio/mpeg")).toBe("audio");
  expect(previewKind("application/pdf")).toBe("pdf");
  expect(previewKind("text/plain")).toBe("text");
  expect(previewKind("application/json")).toBe("text");
  expect(previewKind("application/zip")).toBe("none");
  expect(previewKind(null)).toBe("none");
});
