/** R2 分片大小（最小 5MB，末片除外）。原先定义在 routes/uploads.ts，被 routes/me.ts 跨模块引用；上收到 lib。 */
export const PART_SIZE = 16 * 1048576;
