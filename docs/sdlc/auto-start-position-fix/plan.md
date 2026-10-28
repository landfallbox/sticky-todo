# 自启动窗口位置恢复 — 实现计划

档位：单个功能点（轻量版，intent/spec 合并入本文件）
日期：2026-10-28
状态：已确认，已实施（自动验证通过，手动验证待用户执行）

## 意图

应用支持开机自启（注册表 Run 键），但每次启动（含自启）窗口都显示在桌面中间，
而不是上次关闭时的位置。目标：启动时恢复上次关闭时的**完整窗口状态**——
位置、大小、停靠边缘、折叠与否（关闭时折叠则恢复后保持折叠，露出 16px 边条，
悬停/点击可展开）；无有效记录时保持现状（居中）。

## 根因

- `main()` 的 `setup()` 无条件调用 `win.center()`，每次启动都居中。
- 窗口位置/大小与 DockInfo（停靠边缘、折叠状态）从未持久化。

## 方案选型

| 方案 | 说明 | 结论 |
|------|------|------|
| A. Rust 侧自实现持久化 | 拖动结束/关闭时把窗口状态写 `window_state.json`（与 `todos.json` 同目录）；启动时校验后恢复 | 采用：改动小、无新依赖，可完整处理停靠/折叠语义 |
| B. tauri-plugin-window-state | 现成插件 | 不采用：新增依赖；只存位置/大小，无法表达停靠边缘与折叠状态 |
| C. 前端 JS 侧持久化 | webview 监听移动存 localStorage | 不采用：Tauri webview 无原生 move 事件，需轮询；启动时 JS 未就绪，恢复时序不可靠 |

## 设计

### 1. 持久化内容（`window_state.json`，与 `todos.json` 同目录，遵循 `STICKYTODO_DATA_DIR`）

```json
{ "x": 0, "y": 0, "width": 320, "height": 480, "edge": "none", "collapsed": false }
```

- `x/y` 恒为**展开位置**（outer，物理像素）：非停靠时即窗口位置；
  停靠时为 DockInfo 的 `exp_x/exp_y`。
- `edge`：`none | left | right | top`；`collapsed`：是否折叠。
- 折叠位置不直接落盘：它是「展开位置 + 显示器几何 + 16px 条」推导出来的，
  恢复时按**当前**显示器几何重新推导，避免显示器布局变化后边条错位。

### 2. 落盘时机（覆盖所有状态变化路径）

统一入口 `persist_position(window, state)`：读 DockInfo——
- 停靠 → 存 `exp_x/exp_y + width/height + edge + is_collapsed`；
- 非停靠 → 存当前 outer 位置+大小，`edge=none, collapsed=false`。

调用点：
- `handle_drag_ended`（`WM_EXITSIZEMOVE`）：拖动/缩放结束、吸附判定之后。
- `hide_window`（关闭按钮，应用驻留托盘）：关闭瞬间兜底落盘，
  捕获当前折叠状态（如自动折叠后未再拖动就关闭）。
- 折叠/展开动画（`animate_move`）不单独落盘：目标位置均由最后一次
  拖动推导，且关闭时的落盘会兜底。

### 3. 启动恢复（`setup()`，替换无条件 `win.center()`）

1. 读取 `window_state.json`；缺失/损坏 → 居中（现状）。
2. 有效性校验：以**展开矩形**（x/y/w/h）与可用显示器求交，宽、高两向
   重叠均 ≥ 60px 才算有效（防显示器拔掉/布局变化后恢复到屏幕外）；
   无效 → 居中、不恢复停靠。
3. 大小钳制到最小值 280×300（tauri.conf.json minWidth/minHeight）。
4. 停靠时：按当前显示器几何用 `dock_geometry()` 重新推导 exp/col
   （与 `handle_drag_ended` 同一套公式，抽成共享函数）；
   写回 `AppState.dock`（edge、exp、col、width、height、is_collapsed），
   使光标监视线程（悬停展开、离开自动折叠）对新状态立即生效。
5. 先 `set_size` 再 `set_position`（Windows 缩放固定左上角）；
   位置取折叠 ? col : exp。
6. 前端同步：新增 `get_dock_state` 命令返回 `{docked, edge, collapsed}`；
   `app.js` 在 `init()` 中 invoke 并应用 `docked`/`dock-{edge}`/`collapsed`
   body 类（与 `dock-changed`/`collapsed-changed` 事件相同的处理），
   使 16px 边条（edge-peek）正确显示、可悬停/点击展开。
   采用「前端拉取」而非 setup 里 emit 事件：事件在 webview JS 就绪前
   发出会丢失，拉取无时序问题。
7. `tauri.conf.json` 的 `center: true` 保留：创建时先居中，恢复代码
   随后覆盖；恢复失败时仍有合理兜底。

## 改动文件

1. `src-tauri/src/window_state.rs`（新增，约 60 行）
   - `WindowState { x, y, width, height, edge: DockEdge, collapsed: bool }`
     + `load()` / `save()`（JSON，失败静默）。
2. `src-tauri/src/todo_store.rs`
   - 抽出 `pub fn data_dir() -> PathBuf`，`data_path()` 复用（共享目录逻辑）。
3. `src-tauri/src/main.rs`
   - `mod window_state;`；`DockEdge` 加 `serde` 派生（已有 Serialize/Deserialize）。
   - 新增 `persist_position(window, state)`、`dock_geometry(edge, exp, size, monitor)`
     （从 `handle_drag_ended` 抽出的几何公式，两处共用）。
   - `hide_window` 增加 `state: State<AppState>` 参数，hide 前落盘。
   - `handle_drag_ended` 末尾调用 `persist_position`。
   - 新增 `get_dock_state` 命令 + 注册到 `invoke_handler`。
   - `setup()`：恢复逻辑（上述第 3 节步骤）。
4. `src/assets/app.js`
   - `init()` 中新增 `restoreDockState()`：invoke `get_dock_state`，
     按返回应用 body 类（复用与 `dock-changed` 监听相同的类操作）。

不改 `tauri.conf.json`、不改自启注册逻辑、不改停靠交互行为。

## 影响面

- Rust 侧新增持久化 + 启动恢复；前端仅 init 时多一次 invoke + 类操作。
- todos 数据、自启注册、托盘、停靠交互行为均不变。
- 首次启动（无 `window_state.json`）行为与现状一致（居中）。
- 风险点与对策：
  - 显示器布局变化 → 恢复时按当前几何重推 col + 展开矩形有效性校验，
    无效回退居中。
  - 恢复折叠状态后光标监视线程依赖 DockInfo → 恢复时同步写回 AppState。
  - 落盘失败静默（与 `todos.json` 一致），最坏情况回退居中。

## 验证

### 自动验证记录（2026-07-21）

| 验证项 | 结果 |
|--------|------|
| `cargo build`（src-tauri，dev profile） | 通过，无警告 |
| `cargo fmt --check` | 通过 |
| `cargo clippy --all-targets -- -D warnings` | 通过，无警告 |
| `node --check src/assets/app.js`（CI 前端语法门禁） | 通过 |

以上与 `.github/workflows/ci.yml` 的 static-check / build 门禁一致。

**实施偏差（与计划相比）**：`DockEdge` 从 `main.rs` 整体移入 `window_state.rs`（而非留在 main.rs 加 serde 派生），模块归属更清晰，行为不变；其余按计划实施。

**已知边界**：`monitor_for_state` 的显示器匹配采用"展开矩形与显示器重叠两向均 ≥ 60px"启发式，多显示器且窗口恰好跨屏时可能匹配到相邻显示器（随后由 `clamp_to_monitor` 兜底），不影响可用性。

### CodeRabbit 审查意见处理（PR #5，2026-10-28）

| 意见 | 处理 |
|------|------|
| `monitor_for_state` 重叠计算可能 i32 溢出（debug 构建 panic） | 已修：坐标运算全部加宽为 i64 |
| 恢复尺寸未钳制到显示器（大屏窗口换小屏后停靠到屏幕外） | 已修：宽/高钳制到所选显示器（显示器本身小于最小值时保留最小值） |
| `set_size`/`set_position` 失败未检查，`AppState.dock` 先于实际生效被写入 | 已修：先应用尺寸/位置，任一失败返回 false（回退居中）；成功后才写回 dock 状态 |
| OS 关闭（Alt+F4/任务栏）绕过 `hide_window`，未落盘 | 已修：`on_window_event` 监听 `CloseRequested`，销毁前调用同一 `persist_position` |

修复后重新验证：`cargo build` / `cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` 全部通过。

### 手动验证（`npm run tauri dev`，待用户执行）
  1. 拖动窗口到任意位置 → 关闭（hide）→ 重启 → 窗口回到上次位置。
  2. 缩放窗口 → 关闭 → 重启 → 大小也恢复。
  3. 拖动到右边缘吸附 → 等自动折叠 → 关闭 → 重启 → 窗口保持折叠，
     右边缘露出 16px 边条；悬停/点击边条 → 正常展开。
  4. 拖动到右边缘吸附 → 展开状态关闭 → 重启 → 窗口完整显示在右边缘
     （随后按既有逻辑鼠标离开自动折叠）。
  5. 删除 `window_state.json` 后重启 → 居中（兜底）。
  6. 隔离开发模式（`STICKYTODO_DATA_DIR`）下状态文件落在隔离目录。
