# TODO 编辑入口（hover 编辑按钮）

> 档位：单个功能点（改动小、影响面可控）。
> 按 AI-Native SDLC 轻量档，intent / spec / plan 合并为本文档。

## 1. 当前问题（Intent）

- **现象**：用户反馈「TODO 项写入后不能改」。
- **根因**：代码里其实**已有编辑能力**（自 v0.1.0 起）——双击 TODO 文本即可进入编辑，后端 `edit_todo` 命令与前端 `editTodo()` 均已存在。问题在于**可发现性差**：没有任何视觉提示（无 hover 变化、无 tooltip、无按钮），用户不知道可以双击编辑。
- **期望结果**：在保留双击编辑的同时，鼠标悬停在 TODO 项上时出现一个显式的「编辑」按钮，点击即可编辑，让用户一眼就能发现编辑功能。
- **受影响系统**：仅前端 UI（`src/assets/app.js` 的 `render()` 模板 + `src/assets/style.css`）。后端、数据模型、存储格式均不变。
- **明确不做**：
  - 不改后端 / 不改 `TodoItem` 数据结构 / 不改 `todos.json` 格式。
  - 不新增多行编辑、富文本、编辑历史等能力（当前编辑仅改单行文本，维持现状）。
  - 不改动拖拽排序、删除、勾选等既有交互。
- **待确认**：无（用户已确认：保留双击 + 新增 hover 编辑按钮）。

## 2. 功能如何工作（Spec）

- **交互**：
  - 悬停某 TODO 项时，文本右侧、删除按钮左侧出现一个铅笔「编辑」按钮（与删除按钮同一 hover 显隐逻辑，平时 `opacity: 0`，`.todo-item:hover` 时 `opacity: 1`）。
  - 点击编辑按钮 → 调用既有 `editTodo(id)`：把 `.todo-text` 替换为输入框，聚焦并全选；Enter 或失焦保存，Esc 取消。
  - 双击文本编辑保留不变，作为快捷方式。
- **数据流**：按钮点击 → `editTodo(id)` → `invoke('edit_todo', {id, text})` → 后端 `edit()` 更新内存并 `save()` 到 `todos.json` → 返回最新列表 → `render()` 重绘。全程复用现有链路，无新增 IPC。
- **影响面**：纯展示层新增一个按钮及其样式；不触碰状态机、窗口/停靠逻辑、设置面板。
- **安全 / 合规 / 性能疑点**：
  - 无新增外部输入，`edit_todo` 已有（`editTodo` 内对空文本有 trim 保护）。
  - 按钮内联 `onclick="editTodo('${item.id}')"` 与现有删除按钮写法一致；`item.id` 为内部生成的十六进制串，无注入风险（与现状一致）。
  - 性能影响可忽略（每行多一个静态按钮节点）。

## 3. 实现计划（Plan）

按顺序修改 2 个文件：

### 步骤 1 — `src/assets/app.js`（`render()` 模板）
- 在 `todo-text` 与 `todo-delete` 之间插入编辑按钮：
  ```html
  <button class="todo-edit" onclick="editTodo('${item.id}')" title="编辑">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9 9.5 2.5z"
            stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>
  ```
- 不改动 `editTodo()` 函数本身（已满足需求）。

### 步骤 2 — `src/assets/style.css`
- 新增 `.todo-edit` 样式，完全镜像 `.todo-delete`：
  - 基础：`width/height: 24px`、flex 居中、透明背景、`color: var(--text-tertiary)`、`border-radius: var(--radius-sm)`、`cursor: pointer`、`opacity: 0`、`flex-shrink: 0`、相同 `transition`。
  - `.todo-item:hover .todo-edit { opacity: 1; }`
  - `.todo-edit:hover { color: var(--accent); background: rgba(0, 103, 192, 0.08); }`（用 accent 而非红色，与删除区分）
  - `.todo-edit:active { transform: scale(0.85); }`

### 可能破坏的已有功能
- **拖拽排序**：编辑按钮位于可拖拽 `li` 内，与已存在的删除按钮位置/行为一致，不引入新风险；从按钮上拖拽的行为与删除按钮现状相同。
- **编辑态**：`editTodo` 用 `el.querySelector('.todo-text')` 定位并替换为输入框，按钮仍在不影响；`render()` 重绘后一切复位。
- 无其他状态机 / 窗口逻辑受影响。

### 最容易出问题的一步
- **步骤 1 的模板字符串**：`render()` 用模板字符串拼 HTML，注意引号嵌套与 `${item.id}` 插值正确、SVG 属性引号不破坏外层字符串。改完需肉眼核对生成的 DOM。
- 备选方案（若 hover 按钮与拖拽手势冲突）：把按钮改为仅在非拖拽时响应，或改用 `pointer-events` 控制；当前预期不需要。

### 验证命令 / 步骤
- 仓库无测试框架（`package.json` 仅 `tauri` 脚本，前端为纯 HTML/JS/CSS 无构建步骤）。
- 前端改动**无需**重新编译 Rust。
- 手动验证：
  1. `npm run tauri dev`（或 `start.bat`）启动应用。
  2. 新建若干 TODO，鼠标悬停 → 确认编辑按钮随删除按钮一起淡入。
  3. 点击编辑按钮 → 文本变输入框、聚焦全选；改文字后 Enter 保存 → 持久化生效（重启后仍在）。
  4. Esc 取消 → 文本还原。
  5. 双击文本编辑仍可用；拖拽排序、删除、勾选、清空已完成均正常。

## 4. 产物
- 本文件：`docs/sdlc/todo-edit-button/plan.md`
