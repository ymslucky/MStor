import { STORAGE_KEYS } from "./storage";

export type Skin = "paper" | "slate" | "ink" | "brutal";
export type Density = "comfortable" | "compact";

const SKIN_KEY = STORAGE_KEYS.skin;
const DENSITY_KEY = STORAGE_KEYS.density;

const DEFAULT_SKIN: Skin = "slate";

function apply(attr: "data-skin" | "data-density", value: string | null) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const isDefault =
    !value ||
    (attr === "data-density" && value === "comfortable") ||
    // 皮肤默认值也要写属性：CSS 里的 L1 基础值只作为兜底
    (attr === "data-skin" && value === DEFAULT_SKIN && el.getAttribute("data-skin") === DEFAULT_SKIN);
  if (isDefault && attr === "data-density") {
    el.removeAttribute(attr);
  } else if (value) {
    el.setAttribute(attr, value);
  }
}

export function readSkin(): Skin {
  if (typeof localStorage === "undefined") return DEFAULT_SKIN;
  const v = localStorage.getItem(SKIN_KEY);
  return v === "paper" || v === "slate" || v === "ink" || v === "brutal" ? v : DEFAULT_SKIN;
}

export function readDensity(): Density {
  if (typeof localStorage === "undefined") return "comfortable";
  return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

export function setSkin(skin: Skin) {
  localStorage.setItem(SKIN_KEY, skin);
  apply("data-skin", skin);
}

export function setDensity(density: Density) {
  localStorage.setItem(DENSITY_KEY, density);
  apply("data-density", density);
}

/** 应用启动时把已保存的皮肤/密度写到 <html> 上（必须在首帧前调用） */
export function initAppearance() {
  apply("data-skin", readSkin());
  apply("data-density", readDensity());
}
