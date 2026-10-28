# Plan：输入框 / 编辑框自适应高度（支持多行）

> 状态：待批准
> 依据：[intent.md](./intent.md)（已确认）、[spec.md](./spec.md)（已确认）
> 日期：2026-10-28

## 改动文件（按实现顺序）

### 第 1 步：`src/index.html` — 添加框元素替换

- `<input type="text" id="todo-input" placeholder="添加新的待办事项..." autocomplete="off" />`
  → `<textarea id="todo-input" rows="1" placeholder="添加新的待办事项...（Shift+Enter 换行）" autocomplete="off" spellcheck="false"></textarea>`
- 仅此一处 HTML 改动；`#btn-add`、事件绑定 ID 均不变。

### 第 2 步：`src/assets/style.css` — 样式

1. `#todo-input`（约 L178）：
   - `height: 36px` → `min-height: 36px; max-height: 90px; overflow-y: auto; resize: none;`
   - `padding: 0 14px` → `padding: 7px 14px`（13px×1.4 行高 18.2 + 14 内边距 + 3 边框 ≈ 36px，保持初始高度不变）
   - 补 `line-height: 1.4`
2. `.todo-edit-input`（约 L383）：补 `resize: none; max-height: 90px; overflow-y: auto;`
3. `.todo-text`（约 L373）：补 `white-space: pre-wrap;`
4. `.todo-item`（约 L289）：`align-items: center` → `flex-start`；`.todo-checkbox`、`.todo-edit`、`.todo-delete` 各加 `margin-top: 2px`，使单行时视觉对齐不漂移

### 第 3 步：`src/assets/app.js` — 逻辑

1. 新增公共函数（放在 `addTodo` 前）：
   ```js
   const INPUT_MAX_HEIGHT = 90;
   function autoResize(el) {
     el.style.height = 'auto';
     const cs = getComputedStyle(el);
     const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
     el.style.height = Math.min(el.scrollHeight + border, INPUT_MAX_HEIGHT) + 'px';
   }
   ```
   （执行中发现：`box-sizing: border-box` 下 `scrollHeight` 不含边框，需补边框宽度，否则 2 行内容时右侧出现微小滚动条）
2. `setupEventListeners()`（约 L134）：
   - keydown：`if (e.key === 'Enter') addTodo()` → `if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); addTodo(); }`（textarea 的 Enter 默认会插入换行，必须 preventDefault，否则提交后残留 `\n`——执行中发现并修正；`!e.isComposing` 防止中文输入法合成期按 Enter 确认候选词时误提交——PR 评审后补充）
   - 新增 `todoInput.addEventListener('input', () => autoResize(todoInput))`
3. `addTodo()`（约 L316）：`todoInput.value = ''` 后补 `autoResize(todoInput)`（高度回落 36px）
4. `editTodo()`（约 L349）：
   - `document.createElement('input')` → `document.createElement('textarea')`，`rows = 1`、`spellcheck = false`，去掉 `input.type = 'text'`
   - `textSpan.replaceWith(input)` 后补 `autoResize(input)`（按已有内容撑开）
   - keydown：`if (e.key === 'Enter') input.blur()` → `if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); input.blur(); }`（同上，需 preventDefault 与 IME 守卫）
   - 新增 `input.addEventListener('input', () => autoResize(input))`
   - `input.select()` 对 textarea 同样有效，保留

### 不改的部分

- `src-tauri/` 全部不动（存储无校验，`\n` 原样入库）
- 渲染模板、`escapeHtml`、拖拽排序、勾选、删除、设置面板均不动

## 可能破坏的已有功能

| 风险点 | 说明 | 缓解 |
|--------|------|------|
| Enter 提交失效 | keydown 条件改动是核心交互，写错则主流程瘫痪 | 改动仅加 `!e.shiftKey`，验证清单第 2 条必测 |
| 初始高度漂移 | textarea 默认 padding/行高与 input 不同，36px 可能变高/变矮 | 显式设 `line-height: 1.4` + 调 padding，启动后目测对比 |
| 单行条目布局漂移 | `align-items: flex-start` 影响所有条目（含单行） | 按钮/复选框加 2px margin-top，验证单行条目观感 |
| 编辑框 blur 时序 | textarea 的 blur/keydown 行为与 input 一致，但需确认 Esc 还原路径 | 验证清单第 4 条覆盖 |

## 最容易出问题的一步

**第 2 步 CSS 的初始高度**：textarea 的默认内边距和行高与 input 不同，若 36px 没对齐，整个输入区视觉会"变胖"，且 autoResize 的基准高度也跟着错。对策：改完后先启动应用目测初始高度，再测增高。

**备选方案**（若 autoResize 的 scrollHeight 方案有意外）：
- 备选 A：纯 CSS 方案，`field-sizing: content`（Chromium 新特性，WebView2 新版支持）+ `max-height`，零 JS。风险：旧版 WebView2 不支持，需降级兜底，复杂度反而更高。不推荐。
- 备选 B：按字符数估算行数（`Math.ceil(value.length / 每行字符数)`）。不精确（中英文宽度不同），不推荐。

## 验证命令 / 步骤

无测试框架、无 linter，验证以隔离数据启动 + 手工走查为主：

```powershell
npm run dev:isolated
```

按 spec.md 验收标准逐条走查：

1. 输入 1 行 → 36px；逐行加到 4 行 → 高度递增；第 5 行起 → 框内滚动条，高度封顶
2. `Enter` 提交成功；`Shift+Enter` 框内换行且高度增长
3. 含换行的条目在列表按换行展示，复选框/按钮顶部对齐；单行条目观感与改动前一致
4. 编辑：框按内容高度打开；`Enter` 保存、`Shift+Enter` 换行、`Esc` 还原
5. 全选删除后高度回落 36px；切换深色/浅色主题样式正常
6. 回归：勾选完成、拖拽排序、删除、清除已完成、设置面板均正常
