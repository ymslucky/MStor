export type Skin = "paper" | "slate" | "ink";
export type Density = "comfortable" | "compact";

const SKIN_KEY = "mstor_skin";
const DENSITY_KEY = "mstor_density";

function apply(attr: "data-skin" | "data-density", value: string | null) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (!value || (attr === "data-skin" && value === "paper") || (attr === "data-density" && value === "comfortable")) {
    el.removeAttribute(attr); // paper / comfortable 是默认值，不写属性
  } else {
    el.setAttribute(attr, value);
  }
}

export function readSkin(): Skin {
  if (typeof localStorage === "undefined") return "paper";
  const v = localStorage.getItem(SKIN_KEY);
  return v === "slate" || v === "ink" ? v : "paper";
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
