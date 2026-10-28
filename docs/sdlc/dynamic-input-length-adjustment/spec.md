# Spec：输入框 / 编辑框自适应高度（支持多行）

> 状态：待确认
> 依据：[intent.md](./intent.md)（已确认）
> 日期：2026-10-28

## 1. 功能如何工作

### 1.1 添加输入框

- 元素由 `<input type="text" id="todo-input">` 改为 `<textarea id="todo-input">`（单行起始，`rows="1"`，禁用自动补全与拼写检查，禁用右下角拖拽手柄）。
- **自适应高度**：初始 36px（与现状一致）；输入时随 `scrollHeight` 增高；上限 **90px（约 4 行**：13px 字号 × 1.4 行高 × 4 ≈ 73px + 上下内边距 ≈ 90px）；超过上限后 `overflow-y: auto` 框内滚动。
- **提交语义**：`Enter` 提交（等同点 + 号按钮）；`Shift + Enter` 换行。
- placeholder 更新为：`添加新的待办事项...（Shift+Enter 换行）`。

### 1.2 编辑输入框

- `editTodo()` 动态创建的输入框同步改为 `<textarea class="todo-edit-input">`，行为与添加框一致：自适应高度（同一上限）、`Enter` 提交（blur 保存）、`Shift + Enter` 换行、`Esc` 取消。
- 进入编辑时按已有内容立即撑开到正确高度。

### 1.3 列表展示

- `.todo-text` 增加 `white-space: pre-wrap`：存储的 `\n` 按真实换行渲染（现有 `word-break: break-word` 保留，长单词/URL 仍自动断行）。
- `.todo-item` 的 `align-items` 由 `center` 改为 `flex-start`，多行文本时复选框与操作按钮顶部对齐（单行时视觉差异可忽略，按钮加 2px 上边距保持视觉居中）。
- 展示逻辑纯 CSS 实现，`escapeHtml` 已用 `textContent` 转义，换行符安全。

## 2. 数据如何流动

```
用户输入（含 Shift+Enter 换行）
  → textarea.value（含 \n）
  → addTodo()/finish() 中 .trim()（仅去首尾空白，保留内部换行）
  → invoke('add_todo' | 'edit_todo', { text })
  → Rust 原样存储（已确认无长度/内容校验）
  → render() 时 escapeHtml 转义 + pre-wrap 渲染换行
```

- **后端零改动**：`add_todo` / `edit_todo` 接收 `String` 原样入库，JSON 序列化天然支持 `\n`。
- **无数据迁移**：存量数据不含换行符，渲染行为不变；新数据含换行符，`pre-wrap` 正确展示。

## 3. 影响哪些系统

| 文件 | 改动 |
|------|------|
| `src/index.html` | `<input>` → `<textarea>`，placeholder 加提示 |
| `src/assets/app.js` | ① 新增 `autoResize(el)` 公共函数（两处复用）；② 添加框 keydown 改为「Enter 且非 Shift 才提交」+ `input` 事件调 autoResize；③ `addTodo()` 清空后重置高度；④ `editTodo()` 创建 textarea、初始撑高、Enter/Shift+Enter 逻辑；⑤ 渲染模板无需改（换行由 CSS 处理） |
| `src/assets/style.css` | ① `#todo-input` 与 `.todo-edit-input` 改按 textarea 样式（`resize: none`、`line-height`、`max-height: 90px`、`overflow-y: auto`）；② `.todo-text` 加 `white-space: pre-wrap`；③ `.todo-item` 改 `align-items: flex-start` 并微调按钮对齐 |
| `src-tauri/` | **无改动** |

## 4. 安全 / 合规 / 性能疑点

- **XSS**：无新增风险。展示仍走 `escapeHtml`（textContent 转义），换行符是纯文本字符。
- **既有 XSS 隐患（非本次引入）**：`ondblclick="editTodo('${item.id}')"` 内联事件中 id 为后端生成的 UUID，不可被用户内容注入；本次不改，保持现状。
- **性能**：autoResize 每次 `input` 事件做一次 `scrollHeight` 读取，便签量级（<200 条）无压力，无需节流。
- **兼容性**：`white-space: pre-wrap`、textarea auto-resize 均为 Tauri 2（WebView2 on Windows）基础能力，无兼容问题。
- **边界**：
  - 粘贴多行文本 → `input` 事件触发 autoResize，正确撑高/滚动。
  - 全选删除后 → 高度回落（autoResize 先 `height = 'auto'` 再设值）。
  - 窗口极矮（≤350px 媒体查询）→ 输入区 padding 已收紧，90px 上限不影响布局（列表区 `flex: 1` 自行压缩）。
  - 提交后 `trim()` 空内容 → 维持现状：不添加、重新聚焦。

## 5. 验收标准

1. 添加框输入 1 行内容：36px 高；逐行输入到 4 行：高度递增；第 5 行起：框内出现滚动条，高度不再增长。
2. `Enter` 提交；`Shift+Enter` 在框内换行且高度随之增长。
3. 含换行的待办在列表中按换行展示，复选框/按钮顶部对齐。
4. 双击/点铅笔编辑：框按内容高度打开；`Enter` 保存、`Shift+Enter` 换行、`Esc` 还原。
5. 删除/清空后输入框高度回落至 36px；深色/浅色主题下样式正常。
