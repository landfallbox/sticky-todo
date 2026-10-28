# 深色模式 — 实现计划

档位：单个功能点（轻量版，intent/spec 合并入本文件）
日期：2026-10-27
状态：已确认

## 意图

应用目前只有白色（浅色）样式。目标：支持浅色 / 深色 / 跟随系统三档主题，
偏好持久化，切换即时生效，首帧无白闪。

## 设计

- 主题通过 `<html data-theme="light|dark">` 属性驱动，CSS 变量覆盖实现。
- 偏好存 `localStorage`（键 `sticky-todo:theme`，值 `light`/`dark`/`system`，
  缺省 `system`）。
- 「跟随系统」监听 `prefers-color-scheme` 变化实时切换。
- 入口：设置面板新增「主题」行，三选一分段控件。
- 不改 Rust：窗口背景由 CSS 绘制（`--bg-mica`），localStorage 足够承载 UI 偏好。

## 改动文件

1. `src/assets/style.css`
   - `:root` 保留浅色 token；新增 `[data-theme="dark"]` 深色 token 块
     （Fluent 深色：mica `#202020`、card `#2d2d2d`、card-hover `#333333`、
     text `#ffffff`/`#c5c5c5`/`#9a9a9a`、accent `#4cc2ff`、accent-hover `#66cdff`、
     border/shadow 换白色半透明）。
   - 硬编码颜色收敛为变量：标题栏按钮 hover、输入框聚焦阴影、link-btn hover、
     滚动条、删除按钮 hover、edge-peek 光晕、Fluent 开关轨道/滑块、
     settings-btn 背景/hover/active。
   - 新增 `color-scheme`（light/dark）适配光标与原生控件。
   - 新增分段控件（segmented control）样式。
2. `src/index.html`
   - 设置面板「主题」行 + 分段控件（浅色/深色/跟随系统）。
   - `<head>` 内联脚本：渲染前读取 localStorage 应用 `data-theme`，避免白闪。
3. `src/assets/app.js`
   - `getStoredTheme()` / `applyTheme(mode)` / 系统偏好监听。
   - 分段控件事件：更新 localStorage + 立即应用 + 高亮选中项。
   - 初始化时同步控件选中态。

## 影响面

- 纯前端，无 Rust / 数据变更；现有浅色外观保持默认（system 模式下浅色系统不变）。
- 风险低：仅新增 CSS 变量块与少量 JS；深色 token 只影响 `data-theme="dark"`。

## 验证

- `npm run tauri dev` 启动，手动验证：
  1. 三档切换即时生效（标题栏、输入框、列表、设置面板、空状态、边缘吸附条）。
  2. 跟随系统：改系统深浅色后实时切换。
  3. 重启应用后偏好保持。
  4. 浅色模式外观与改动前一致。

## 验证记录（2026-07-27）

- `node --check src/assets/app.js` 语法通过。
- `npm run tauri dev` 编译成功（4m48s），应用正常启动。
- 浏览器加载同一 `index.html` 实测：
  - `dark` → `data-theme="dark"`，body `#202020`、输入框 `#2d2d2d`，正确。
  - `light` → `data-theme="light"`，body `#f3f3f3`、输入框 `#ffffff`（与原浅色一致）。
  - `system` → 按系统偏好解析为 dark，正确。
  - 设置面板分段控件：选中态高亮正确；点击「浅色」即时切换 + localStorage 持久化正确。
  - 深色下设置面板截图确认：开关、按钮、文字、边框对比度正常。
