# 文件列表迁移到 TanStack Table（施工单）

> 目标：解决「浏览视图体验差」——表头与行的对齐靠两套手写 grid 模板、列宽/排序/列显隐分散三处、固定行高 48px 不能自适应。
> 前置：`@tanstack/react-table@9.3.1` 已装并锁定（`d431712`）；虚拟化**不需要换**，`VirtualizedList` 已在用 `@tanstack/react-virtual`。

## 0. 现状（已确认的事实，不要重复调研）

| 文件 | 行数 | 现在负责什么 |
|---|---:|---|
| `components/FileList.tsx` | 402 | 数据过滤/选择/拖拽移动/三处渲染路径（列表行、虚拟行、网格）/右键/列宽拖拽 |
| `components/FileListHeader.tsx` | 182 | 名称过滤输入 + 列显隐菜单 + 可排序表头 + 名称列拖拽调宽（手写 `thCls` 与 grid 模板） |
| `components/FileRow.tsx` | 43 | 行内布局（图标/名称/复制键/角标/大小/时间/操作列） |
| `components/VirtualizedList.tsx` | 45 | `useVirtualizer`：固定 `ROW_HEIGHT=48`、`overscan 8`、`scrollToIndex` |
| `hooks/useColumnPrefs.ts` | — | `ColPref`（`showSize/showTime/nameW/sort`）+ `localStorage` 持久化 + `compareNodes` |

**为什么要迁**：列宽/排序/显隐/对齐是同一件事的四个侧面，现在分在三处手工同步。

## 1. 新增 `hooks/useFileTable.ts`

保持 `useColumnPrefs` 的持久化键与语义不变，把状态搬进 table：

```ts
const table = useReactTable({
  data: nodes,
  columns,                     // 名称 / 大小 / 修改时间 / 操作
  state: { sorting, columnVisibility, rowSelection, columnSizing },
  onSortingChange, onColumnVisibilityChange, onRowSelectionChange, onColumnSizingChange,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  enableRowSelection: true,
  getRowId: (n) => n.id,       // 与现有 selection Set<string> 对齐
});
```

要点：
- `SortKey` 映射：`name` → `sorting=[{id:"name", desc}]`；`null` 表示保持服务端顺序（`manualSorting` 只在有 sort 时启用）
- `columnVisibility`：`{ size: pref.showSize, updated_at: pref.showTime }`
- `columnSizing`：`{ name: pref.nameW ?? 320 }`
- 选择：`rowSelection` 的 `Record<string,boolean>` 与 `useFileSelection` 的 `Set<string>` 双向映射，**Shift 范围选择仍由 `useFileSelection` 负责**（table 不提供范围语义）

## 2. `FileListHeader` 改为渲染表头组

- 用 `table.getHeaderGroups()` 渲染 `<div role="row">`，列宽用 `header.getSize()` 生成 grid 模板（**表头与行共用同一份模板函数**，这是本次的核心收益）
- 排序点击 → `header.column.toggleSorting()`
- 列显隐菜单 → `column.toggleVisibility()`
- 拖拽调宽 → `header.getResizeHandler()`（保留双击复位）
- 删除 `thCls` 常量与手写模板字符串

## 3. `FileList` 改为按行模型渲染

- 行数据来自 `table.getRowModel().rows`，`rowCells` 接收 `Row<Node>` 而不是 `Node`
- `VirtualizedList` 接口不变（`row(n, index, top)`），仅把 `n = rows[i].original` 传进去
- 网格视图继续用 `FileCard`，与 table 无关（不改）

## 4. 验收清单

- [ ] `FileList.test`（158 行）与 `Browser.test`（568 行）里约 40 条相关断言全绿：点击选中、双击打开目录、Shift 范围选择、拖拽移动、右键菜单、批量条、列显隐、排序、虚拟化窗口
- [ ] 两条虚拟化断言（`>= 50 行触发虚拟化`、`窗口内渲染`）保持通过——**不要**在这个提交里升级 `@tanstack/react-virtual`（上次版本上浮直接让它们变红）
- [ ] `npm run check` / `test:client` / `build` / `test:server:local` 四项全绿再提交

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 一次改三个文件，中间态必然红 | 一口气改完再提交（这是本项目唯一允许的"非原子"提交，因为拆开会出现两套并存的列模型） |
| `columnSizing` 与 `localStorage` 旧结构不兼容 | `useColumnPrefs` 保留为持久化壳，只把读写对上 table 的 state，键名不变 |
| 行高从固定 48 变动态 | 本次**不改行高**（保持 48），动态测量留作后续独立优化，避免一次改两件事 |
