# Intent：软件内更新（Auto Update）

- 日期：2026-10-29
- 状态：待用户确认
- 档位：单个功能点（跨前后端、涉及发版流程，按轻量版走，intent 与 spec 合并讨论后出 plan）

## 当前问题

应用发现新版本后，用户只能点「前往下载」手动打开 GitHub Releases 页面，自己下载安装包、运行安装器、重启应用。流程繁琐，对非技术用户不友好，更新率低。

当前实现：
- 后端 `check_for_updates`（main.rs）通过 `curl.exe` 请求 `https://api.github.com/repos/landfallbox/sticky-todo/releases/latest`，仅返回版本号与 release 页面 URL；
- 前端（app.js）发现新版本后把按钮变为「前往下载」，点击仅调用 `open_external_url` 打开浏览器。

## 期望结果

1. 应用内完成「检查 → 下载 → 安装 → 重启」全流程，用户无需离开应用、无需手动操作安装器。
2. **检查时机**：应用启动时自动静默检查一次（不打扰用户）；若应用持续运行未关闭，保证每天至少再检查一次（距上次检查超过 24 小时触发）；同时保留设置页的手动「检查更新」按钮。
3. **新版本提示**：发现新版本后，设置页「软件更新」行提示，并在主页面标题栏应用名（「便签 Todo」）旁显示一个提示按钮；用户点击「下载并更新」才开始下载；下载完成后静默安装（NSIS），安装器自动重启应用。
4. 下载过程有进度反馈（百分比/状态文字），失败可重试。
5. 更新检查或下载失败时，保留现有「前往下载」按钮作为兜底，跳转 GitHub Releases。

## 受影响系统

| 系统 | 影响 |
|------|------|
| `src-tauri`（Rust 后端） | 引入 `tauri-plugin-updater`；`tauri.conf.json` 增加 `plugins.updater` 配置（endpoint + 公钥）；新增/调整命令（如触发检查、下载、安装+重启）；注册 plugin |
| `src/assets/app.js` + `src/index.html` | 设置页「软件更新」行 UI 改造：状态文字、进度展示、按钮状态机（检查中/发现新版本/下载中 xx%/立即重启/已是最新/重试）；主页面标题栏应用名旁新增新版本提示按钮；启动时自动触发检查 + 运行中每日定时检查 |
| `src-tauri/tauri.conf.json` | 版本号对齐（见约束）；updater 配置 |
| 发版流程 | 每次发版需：用本地私钥签名 NSIS 安装包、发布 `latest.json` 为 release 资产（端点用 `https://github.com/landfallbox/sticky-todo/releases/latest/download/latest.json` 稳定 URL） |
| 密钥管理 | 一次性生成 ed25519 密钥对；**私钥仅存本地，不进仓库**；公钥写入 `tauri.conf.json` |

## 数据 / 技术约束

- 平台仅 Windows（应用现状：NSIS `installMode: currentUser`，无管理员权限安装，与 Tauri updater 的 Windows 行为匹配）。
- 采用官方 `tauri-plugin-updater`（路线 A）：更新端点返回 Tauri 规定的 JSON 格式（version/notes/pub_date/url/signature），安装包必须带 ed25519 签名，客户端强制校验。
- 现有 `check_for_updates` 的 curl 方案与 GitHub `releases/latest` 接口格式不满足 updater 要求，需由 plugin 的检查机制替代或并存（spec 阶段定）。
- **版本号不一致**：`Cargo.toml` 为 0.1.2，`tauri.conf.json` 为 0.2.0，前端展示 v0.1.2。做更新功能前必须对齐，否则版本比较与 updater 判断会出错。已确认对齐目标为 **0.3.0**（第一个启用内更的版本）。
- 网络：用户可能处于无网/公司网环境，检查与下载都必须有超时与失败兜底，不能阻塞应用启动。
- 更新端点走 GitHub（`releases/latest/download/latest.json` 自动指向最新 release 资产），不引入自建服务器。

## 明确不做的事

- 不做 macOS / Linux 更新支持（应用目前仅 Windows）。
- 不做增量更新 / delta 更新，整包 NSIS 覆盖安装。
- 不做「下次退出时安装」的延迟安装策略（本次选择装完立即重启）。
- 不做自动后台静默下载（发现新版本后需用户明确点击才下载）。
- 不做更新回滚机制。
- 不改动待办数据、窗口停靠等其他功能。

## 待确认问题

1. 签名密钥由用户在本地生成（`tauri signer generate`），私钥存放位置由用户自定（如本地安全目录），不进仓库——已确认按此执行；spec 阶段需给出具体操作步骤。
2. ~~启动时自动检查的频率~~ **已确认**：每次启动检查一次；若应用一直没关，保证每天检查一次（距上次检查超过 24 小时触发）。
3. ~~新版本提醒范围~~ **已确认**：不只设置页，主页面标题栏应用名旁加一个提示按钮（点击后进入设置页更新行或直接触发下载并更新，交互细节 spec 阶段定）。
4. ~~第一个启用内更的版本号~~ **已确认**：按建议定为 0.3.0（发版流程有变化，bump minor）。
