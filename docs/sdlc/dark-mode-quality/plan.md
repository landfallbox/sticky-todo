# 深色模式质感修复（Fluent 高度系统 + Acrylic，纯 CSS）— 实现计划

档位：单个功能点（轻量版，intent/spec 合并入本文件）
日期：2026-10-29
状态：已完成（2026-10-30）
前置：`docs/sdlc/dark-mode/plan.md`（深色模式基础实现）

> **方案变更（2026-10-30）**：原方案 C 含真 Mica 窗口背景。调试中发现
> 透明窗口（`transparent: true` + Mica）下 WebView2 的 D3D 渲染表面与窗口几何
> 错位（缩放/最小化/还原后内容整体偏移，属系统级 bug，nudge 无效），故**放弃 Mica**，
> 改为纯 CSS 实现深色质感（保留 Fluent 高度系统 + Acrylic 设置面板 + DWM 主题同步）。
> 下方"设计 / 改动文件 / 验证"已按最终实现更新。

## 意图

深色模式"质感差"的根因：
1. 深色下仍用浅色的高度系统（黑色阴影），在深背景上失效，卡片"浮不起来"；
2. 若干控件细节不符合 Fluent 2 深色规范（accent 按钮白字、开关滑块颜色等）；
3. 设置面板是纯色浮层，缺少 WinUI3 flyout 的 Acrylic 质感。

（原列的"无 Mica 材质"根因随方案放弃 Mica 而移除；背景改用纯色 `#202020`，
靠下方的高度系统 + 边框 + Acrylic 面板营造层次。）

目标：对齐 WinUI3 原生观感——Fluent 深色高度系统 + 设置面板 Acrylic 质感 + DWM 主题同步。
纯 CSS 实现（用户已拍板：放弃 Mica）。

## 设计

### 1. DWM 主题同步（Rust 侧）

- 新增命令 `set_window_theme(dark: bool) -> Result<(), String>`：
  - `win.set_theme(Some(Theme::Dark|Light))` —— Tauri 在 Windows 上会设置
    `DWMWA_USE_IMMERSIVE_DARK_MODE`，使窗口边框/滚动条/通知栏等系统元素跟随主题
    （解决"应用深色但窗口 chrome 仍是浅色"的割裂感）。
- 无 `window-vibrancy` 依赖、无透明窗口、无 `MICA_APPLIED` 状态。
- `tauri.conf.json` 保持 `transparent: false` / `shadow: true`（不透明窗口，阴影正常）。

### 2. JS 侧主题同步

`applyTheme(mode)` 末尾调用：

```js
async function syncWindowTheme(dark) {
  try {
    await invoke('set_window_theme', { dark });
  } catch (err) {
    console.warn('Failed to sync window theme:', err);
  }
}
```

- `invoke` 在浏览器环境（无 Tauri）自动 no-op（返回 `[]`），无需额外判断。
- `setupTheme()` 初始化时经 `applyTheme` 自动触发；系统偏好变化、手动切换主题都会重新同步。

### 3. CSS 改动（style.css）

**深色高度系统（核心）**——深色弃用黑色阴影，改「亮边框 + 顶部高光」：
```css
[data-theme="dark"] {
  --border: rgba(255, 255, 255, 0.1);        /* 0.08 → 0.1，边线更明确 */
  --border-strong: rgba(255, 255, 255, 0.18);
  --shadow-card: inset 0 1px 0 0 rgba(255, 255, 255, 0.06);   /* 顶部高光 */
  --shadow-elevated: 0 8px 24px rgba(0, 0, 0, 0.45),
                     inset 0 1px 0 0 rgba(255, 255, 255, 0.06);
}
```
（`--shadow-card` 被 todo-item hover、settings-row、segmented 选中项复用，一处改全局生效）

**Fluent 2 控件细节**
- 新增 `--accent-contrast`：浅色 `#ffffff` / 深色 `#1a1a1a`；
  `#btn-add`、`.settings-btn.btn-has-update` 文字色改用该变量
  （WinUI3 深色 accent 按钮是亮青底 + 深色字，当前白字对比度错误）。
- 开关滑块 `--switch-knob`：浅色 `#666666 → #1a1a1a`、深色 `#cccccc → #ffffff`
  （Fluent 2 滑块颜色 = 前景色）；深色轨道边框 `0.3 → 0.4`。
- `.todo-edit:hover` 背景由硬编码 `rgba(0,103,192,0.08)` 改为 `var(--accent-soft)`。

**设置面板 Acrylic**
```css
--bg-acrylic: /* 浅色 */ rgba(249, 249, 249, 0.78) / /* 深色 */ rgba(32, 32, 32, 0.78);
.settings-panel {
  background: var(--bg-acrylic);
  backdrop-filter: blur(30px) saturate(150%);
  -webkit-backdrop-filter: blur(30px) saturate(150%);
}
```
（模拟 WinUI3 flyout 的亚克力；模糊对象是面板下方的列表内容）

## 改动文件

| 文件 | 改动 |
|------|------|
| `src-tauri/src/main.rs` | 新增 `set_window_theme` 命令（DWM 主题同步）+ 注册 |
| `src/assets/style.css` | 深色 elevation token（顶部高光 + 亮边框）；`--accent-contrast`；开关滑块色；edit hover 用 `--accent-soft`；设置面板 Acrylic（`--bg-acrylic` 半透明 + `backdrop-filter`） |
| `src/assets/app.js` | 新增 `syncWindowTheme()`，`applyTheme` 中调用 |

不改：`index.html`（首帧脚本逻辑不变）、`tauri.conf.json`（保持 `transparent:false`/`shadow:true`）、`Cargo.toml`、数据层、其余 Rust 逻辑。

## 影响面 / 风险

- 纯增量：浏览器环境 `invoke` no-op，行为不变；不透明窗口无渲染错位风险。
- 风险 1：`backdrop-filter` 在 WebView2 上的模糊表现 → 验证项（已确认计算样式 `blur(30px) saturate(1.5)` 生效）。
- 风险 2：Rust 重新编译耗时（约 1–5 分钟）。
- `set_theme` 包 `#[cfg(target_os = "windows")]`，不影响跨平台编译。

## 验证（已完成）

1. `cargo check`（src-tauri）通过。
2. `npm run tauri dev` 启动，窗口渲染正常（不透明、无错位、阴影保留、浅色模式正常）。
3. ego 浏览器加载 `src/index.html`，强制 `data-theme="dark"` + 注入真实待办，读取计算样式确认：
   - `body` 背景 `rgb(32,32,32)`（#202020）、文字 `#ffffff`；
   - todo 卡片 `#2d2d2d`、圆角 8px、边框 `rgba(255,255,255,0.1)`；
   - 已完成项文字降为 `#9a9a9a`；
   - 设置面板 `rgba(32,32,32,0.78)` + `backdrop-filter: blur(30px) saturate(1.5)`（Acrylic 生效）；
   - 分段选中项 `#2d2d2d` + 顶部高光 `inset 0 1px 0 rgba(255,255,255,0.06)`；
   - 强调色 `--accent #4cc2ff` / `--accent-contrast #1a1a1a`（深色 accent 按钮深字，对比度正确）。
4. todo 项对齐：`.todo-item` 改 `align-items: center`（原 `flex-start`），checkbox/编辑/删除按钮相对整块文字垂直居中，单行与多行（2–3 行）项实测偏移均为 0（修复前单行 +2.8 / +4.8px，多行项 checkbox 偏上约 9px）。
5. 浏览器直接打开 `src/index.html`：纯色背景、无透明、无功能回归。
6. 窄窗口输入框：placeholder 缩短为「添加待办事项」，Shift+Enter 提示移至 `title` tooltip；最窄 280px 窗口下实测 placeholder 78px < 内容宽 177px，单行显示（原完整文案约 221px，最窄时换行且第二行被 36px 输入框裁切）。
