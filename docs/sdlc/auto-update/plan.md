# Plan：软件内更新（Auto Update）

- 日期：2026-10-29
- 状态：待用户批准（**批准前不改代码**）
- 上游产物：[intent.md](./intent.md)（已确认）、[spec.md](./spec.md)（已确认）

## 实现顺序（5 步）

### 第 0 步：生成签名密钥（一次性，需用户批准执行）

- 执行：`npx tauri signer generate -w C:\Users\tang\keys\tauri-updater.key`
- 产出：私钥文件（仅存本地，不进仓库）+ 终端打印的 ed25519 公钥
- 公钥值将被写入第 2 步的 `tauri.conf.json`；**没有公钥之前不写 updater 配置**
- 注意：密钥属于敏感操作，执行前单独向用户确认存放路径；若用户已有密钥则跳过

### 第 1 步：版本号对齐 0.3.0

| 文件 | 改动 |
|------|------|
| `src-tauri/Cargo.toml` | `version = "0.3.0"` |
| `src-tauri/tauri.conf.json` | `version = "0.3.0"` |
| `package.json` | `version = "0.3.0"` |
| `src/index.html` | 页脚 `Sticky Todo v0.1.2 · Tauri 2` → `v0.3.0`；`update-status-text` 默认文案 `当前版本 v0.1.2` → `v0.3.0` |

### 第 2 步：Rust 侧接入 updater 插件

| 文件 | 改动 |
|------|------|
| `src-tauri/Cargo.toml` | 新增依赖 `tauri-plugin-updater = "2"` |
| `src-tauri/src/main.rs` | ① `.plugin(tauri_plugin_updater::init())`（与现有 `tauri_plugin_shell::init()` 并列）；② **删除** `check_for_updates` 命令、`is_newer_version` 函数、`UpdateCheckResult` 结构体及命令注册列表中的对应项（`open_external_url` 保留） |
| `src-tauri/tauri.conf.json` | 新增 `plugins.updater`：`endpoints: ["https://github.com/landfallbox/sticky-todo/releases/latest/download/latest.json"]` + `pubkey`（第 0 步公钥） |
| `src-tauri/capabilities/default.json` | `permissions` 增加 `"updater:default"` |

### 第 3 步：前端改造（核心工作量）

**`src/index.html`**
1. 标题栏 `.titlebar-left` 内、`.app-title` 之后新增提示按钮：`<button id="btn-update-hint" class="update-hint hidden" title="发现新版本，点击查看">…</button>`（**不加** `data-tauri-drag-region`，保证可点击；拖拽区仅作用于元素自身）
2. 设置页「软件更新」行：`btn-check-update` 旁新增兜底链接 `<a id="link-github-release" class="update-fallback hidden">前往下载</a>`

**`src/assets/app.js`**（重写「Update Checker」段，约 L193–278）
1. 新增 `updateState` 模块级状态对象：`{ status: 'idle'|'checking'|'up-to-date'|'update-available'|'downloading'|'installing'|'error', latestVersion, releaseNotes, lastCheckedAt, downloaded, total }`
2. `getUpdaterApi()`：优先 `window.__TAURI__.updater`；不可用则返回基于 `invoke('plugin:updater|check')` / `invoke('plugin:updater|download_and_install')` 的兼容封装（进度事件需经 `window.__TAURI_INTERNALS__.transformCallback` 传回调）——**落码时先验证全局命名空间，决定走哪条**
3. `runUpdateCheck(silent)`：调 `check()`，写 `updateState`，刷新 UI；`silent=true`（启动/每日自动）时失败仅 `console.warn`
4. 自动检查：`init()` 末尾调 `runUpdateCheck(true)`；之后 `setTimeout` 24h 循环（到点再查并重新排程）
5. `handleDownloadAndInstall()`：`downloadAndInstall(onEvent)`，`Downloading` 事件更新百分比，`Finished` 后提示「准备安装，应用即将重启…」
6. 设置页按钮状态机（按 spec §5.1 表格）：检查更新 / 已是最新（2.5s 恢复）/ 下载并更新 / 下载中 xx% / 重试；`update-available` 时显示兜底链接（点击走现有 `open_external_url` 打开 `https://github.com/landfallbox/sticky-todo/releases`）
7. 主页面提示按钮：`update-available` 时移除 `hidden`；点击 → 打开设置面板（抽取现有 L154 的 toggle 逻辑为 `openSettings()`，保证幂等打开）
8. **删除**：`compareSemver`、旧 `handleCheckUpdate` 全部逻辑、`latestReleaseUrl` 变量、前端 fetch GitHub API 降级段

**`src/assets/style.css`**
- `.update-hint`：标题栏小胶囊/圆点样式（含 hidden、hover、与 `.titlebar-btn` 视觉协调）
- `.update-fallback`：设置页小字链接样式
- 复用现有 `.btn-has-update` 主操作样式给「下载并更新」

### 第 4 步：.gitignore 保险

- 追加 `*.key`（防私钥误提交）

### 第 5 步：构建与验证

见下方验证清单。

## 可能破坏的已有功能

| 功能 | 风险 | 对策 |
|------|------|------|
| 标题栏拖拽 | 新按钮落在 `.titlebar-left`（拖拽区）内 | 按钮自身不加 `data-tauri-drag-region`；验证拖拽与点击互不干扰 |
| 设置面板开合 | 抽取 `openSettings()` 时可能改坏 toggle 行为 | 保持 `btn-settings` 原有 toggle 语义，`openSettings()` 只做「确保打开」 |
| 待办 CRUD / 自启 / 置顶 / 停靠 / 主题 | 无直接改动 | 回归冒烟（见验证清单） |
| `check_for_updates` 命令 | 删除后若有残留引用会编译/运行报错 | 前后端同批改完，`cargo check` + 运行验证 |
| 开发工作流 | **启用 updater 后 `tauri dev`/`build` 都需要设置 `TAURI_SIGNING_PRIVATE_KEY`，否则构建失败** | 在 `package.json` 的 `dev:isolated` 脚本中不硬编码密钥路径（敏感），改为文档说明；或用户确认后用 `TAURI_SIGNING_PRIVATE_KEY` 环境变量手动注入 |

## 验证清单

1. **Rust 编译**：`src-tauri` 目录 `cargo check`（快验证，先于完整构建）
2. **完整构建**（PowerShell）：
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = "C:\Users\tang\keys\tauri-updater.key"
   npx tauri build
   ```
   产物检查：`src-tauri/target/release/bundle/nsis/*.exe` + `latest.json` + `.sig` 三者齐全
3. **全局命名空间验证**：`npx tauri dev` 起应用后控制台执行 `Object.keys(window.__TAURI__)`，确认含 `updater`；决定 spec §3 的写法 A/B
4. **功能验证（内更全流程）**：
   - 安装本次 0.3.0 安装包 → 应用内检查更新 → 应显示「已是最新」（GitHub 上 latest release 即 0.3.0 时）
   - 发布一个 0.3.1 测试 release（带签名 + latest.json 资产）→ 旧 0.3.0 应用内：主页面提示按钮出现 → 设置页「下载并更新」→ 进度 → 自动重启为 0.3.1
   - 验证后删除 0.3.1 测试 release（或保留，视用户意愿）
5. **兜底验证**：断网启动 → 静默无感；手动检查 → 「检查失败」+ 重试；`latest.json` 缺失时（临时移除资产）→ 按检查失败处理
6. **回归冒烟**：待办增删改拖拽、开机自启开关、置顶开关、窗口停靠折叠、主题切换、托盘隐藏/恢复
7. **latest.json 端点**（发版后）：`curl -sL https://github.com/landfallbox/sticky-todo/releases/latest/download/latest.json` 返回合法 JSON

## 最容易出问题的步骤

1. **`window.__TAURI__.updater` 全局命名空间可用性**（第 3 步）——已有兜底（直接 invoke `plugin:updater|*` 命令），但 `download_and_install` 的进度事件回调在直调模式下要经 `transformCallback` 处理，是直调方案里最绕的点。验证成本 2 分钟，风险可控。
2. **构建必须带签名密钥**（第 5 步）——忘记设 `TAURI_SIGNING_PRIVATE_KEY` 会构建失败；且这会改变以后每次 dev/build 的流程，需用户知情。
3. **发版资产遗漏**（latest.json 忘传）——线上表现为所有用户「检查失败」；靠验证清单第 4/7 条前置拦截。

## 备选方案

- **直调 invoke 命令**（全局命名空间不可用时的既定兜底，非事后补救）：功能等价，仅写法不同。
- **放弃内更改回手动**：已否决（intent 已确认路线 A）。
- **每日检查改用「每小时检测一次是否超 24h」**：更抗系统休眠（`setTimeout` 在休眠期间不计时，长休眠后可能延迟检查）；若验证发现休眠场景重要，可低成本切换，不影响其他步骤。
