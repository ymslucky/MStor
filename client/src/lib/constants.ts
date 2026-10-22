/**
 * 跨组件共享的交互阈值与断点：唯一的数值出处，避免同一语义在多个组件里各写一份。
 * 断点与 Tailwind 默认对齐（sm=640 / lg=1024 / xl=1280）。
 */

/** 侧栏/抽屉布局分界（md=768）：抽屉是移动端专用，越过该断点必须关闭 */
export const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
/** 移动端与桌面端的分界（<sm 为手机紧凑布局） */
export const COMPACT_MEDIA_QUERY = "(max-width: 639px)";
/** 详情栏内联为第三列所需的最小宽度（xl）：更窄时回落详情弹窗，避免固定列被裁切 */
export const DETAIL_PANE_MEDIA_QUERY = "(min-width: 1280px)";
/** 触屏指针：单击=打开，长按=多选 */
export const COARSE_POINTER_MEDIA_QUERY = "(pointer: coarse)";

/** 列表行数达到该值才启用虚拟滚动 */
export const VIRTUAL_THRESHOLD = 50;
/** 虚拟列表测量失败（首帧 / jsdom）时的回退渲染行数 */
export const VIRTUAL_FALLBACK_ROWS = 30;
/** 触屏长按进入多选的阈值 */
export const LONG_PRESS_MS = 500;
/** 长按后抑制紧随其后的 click，避免「刚选中又被打开」 */
export const LONG_PRESS_CLICK_GUARD_MS = 600;
/** 批量下载逐个触发的最小间隔（避免浏览器拦截多个下载） */
export const BATCH_DOWNLOAD_GAP_MS = 300;
/** 撤销条展示时长；服务端撤销窗口 30s，前端提前收起避免用户点到已过期 */
export const UNDO_UI_MS = 10_000;
