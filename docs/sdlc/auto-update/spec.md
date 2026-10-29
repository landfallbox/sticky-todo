# Spec：软件内更新（Auto Update）

- 日期：2026-10-29
- 状态：待用户确认
- 上游产物：[intent.md](./intent.md)（已确认）

## 1. 方案总览

采用官方 `tauri-plugin-updater`（Tauri 2）。整体数据流：

```
┌────────────┐  GET latest.json   ┌──────────────────────────────┐
│  前端 app.js │ ─────────────────▶ │ tauri-plugin-updater (Rust)  │
│  (检查/进度/  │ ◀───────────────── │  校验 ed25519 签名            │
│   状态机)    │  事件: 下载进度/完成  │  下载 NSIS 安装包 → 静默安装   │
└────────────┘                    └──────────────┬───────────────┘
                                                 │ HTTPS
                                          ┌──────▼───────────────────────────────┐
                                          │ GitHub Releases (latest 资产)          │
                                          │ latest.json + Sticky Todo_x.y.z_x64-setup.exe │
                                          └──────────────────────────────────────┘
```

- 更新端点：`https://github.com/landfallbox/sticky-todo/releases/latest/download/latest.json`（GitHub 自动重定向到最新 release 的同名资产，无需自建服务器）。
- 安装包：NSIS exe（`installMode: currentUser`，无管理员权限，与现状一致）。
- 签名：ed25519，客户端强制校验 `latest.json` 中的 `signature` 字段与安装包匹配；公钥内嵌 `tauri.conf.json`，私钥仅存本地。

## 2. 更新端点数据格式

`latest.json` **不是构建产物**（tauri-cli 2.12 的 `createUpdaterArtifacts` 只产出 `.sig`，不产出 latest.json），需按本格式**手动创建**后作为 release 资产上传：

```json
{
  "version": "0.3.0",
  "notes": "release notes",
  "pub_date": "2026-10-29T08:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://github.com/landfallbox/sticky-todo/releases/download/v0.3.0/Sticky.Todo_0.3.0_x64-setup.exe",
      "signature": "<.sig 文件内容，base64 ed25519 签名>"
    }
  }
}
```

- `platforms` 键为 `{os}-{arch}`（Windows x64 即 `windows-x86_64`）。客户端按 `windows-x86_64-nsis` → `windows-x86_64` 顺序查找，故 `windows-x86_64` 为有效回退键。
- **资产名坑**：Tauri 产物文件名是 `Sticky Todo_0.3.0_x64-setup.exe`（带空格），但上传到 GitHub 后**资产名中的空格会被替换为点号**（`Sticky.Todo_0.3.0_x64-setup.exe`，v0.2.1 同样如此）。因此 `latest.json` 的 `url` 必须用**点号形式**，写成 `%20` 空格形式会 404 导致更新下载失败。
- `signature` 直接取 `.sig` 文件内容；`url` 应上传后从 `gh api repos/.../releases/tags/vX.Y.Z` 的 `browser_download_url` 字段核对，不要凭文件名推断。

版本比较由 plugin 内置（semver 风格），替代现有 `is_newer_version` 逻辑。

## 3. 检查时机（三处触发，同一实现）

| 触发点 | 行为 |
|--------|------|
| 应用启动 | `init()` 中静默检查一次，失败无感（不弹错误） |
| 运行中每日检查 | 首次检查后启动 24h `setTimeout` 循环：到点再查一次并重新排程；应用不关则每天至少查一次 |
| 手动 | 设置页「检查更新」按钮，失败有可见提示 |

实现要点：
- 检查统一走 `window.__TAURI__.updater.check()`（`withGlobalTauri: true` 已开启，plugin JS 以全局命名空间暴露；现有代码已用 `window.__TAURI__?.core?.invoke` 同类模式，spec 落码时验证该全局可用，不可用则退化为 `__TAURI_INTERNALS__` 通道或 npm 包引入——本应用无打包器，优先全局）。
  - ✅ **已验证（源码级，tauri-plugin-updater 2.14.1）**：插件 build.rs 通过 `global_api_script_path` 注册 `api-iife.js`，tauri-codegen 在 `with_global_tauri=true` 时自动注入，`window.__TAURI__.updater` 可用，无需 npm 包。API 形状：`updater.check()` 返回 `Update 实例 | null`；`downloadAndInstall(onEvent)` 是 **Update 实例方法**（非命名空间顶层函数）；下载事件为 `{event:'Started',data:{contentLength}}` / `{event:'Progress',data:{chunkLength}}` / `{event:'Finished'}`（Rust tag 实为 PascalCase，官方 TS 类型写小写，JS 端已做大小写不敏感兼容）。
- 检查结果集中存一个模块级状态对象（`updateState`：status / latestVersion / releaseNotes / lastCheckedAt），设置页与主页面提示按钮共用。
- 自动检查（启动/每日）发现新版本：静默更新状态，点亮主页面提示按钮，不弹框。
- 手动检查：更新状态 + 设置页状态文字。

## 4. 下载与安装时序

用户点击「下载并更新」后：

```
[发现新版本] --点击下载并更新--> [下载中 xx%] --下载完成--> [安装中] --安装器接管--> 应用退出 → NSIS 静默安装(/S) → 自动启动新版本
```

- 用 plugin 的 `downloadAndInstall(onEvent)`：事件流为 `Downloading {downloaded, total}` → `Finished`。
- 进度换算为百分比写入设置页状态文字（「下载中 42%」）；主页面提示按钮同步显示进度（可选，保持轻量可只显示「更新中」）。
- Windows 上 `install` 会执行下载的安装包并退出当前进程；NSIS 静默安装完成后自动拉起新版本。**待办数据在用户目录 JSON 文件中，安装不触碰**（NSIS 只覆盖程序目录）。
- 安装成功前用户无感知差异：应用闪退式重启属于预期行为，spec 在按钮文案上明示（「下载并更新（完成后自动重启）」）。

## 5. 前端 UI 设计

### 5.1 设置页「软件更新」行（状态机）

| 状态 | 状态文字（update-status-text） | 按钮（btn-check-update） |
|------|------|------|
| idle（未检查/检查中） | 当前版本 v0.3.0 / 正在检查更新… | 检查更新（禁用） |
| up-to-date | 当前已是最新版本 (v0.3.0) | 已是最新（2s 后恢复「检查更新」） |
| update-available | 发现新版本 v0.3.1！ | **下载并更新**（主操作样式）+ 保留次级入口「前往下载」兜底 |
| downloading | 下载中 42%… | 下载中…（禁用）；可加「取消」 |
| installing | 准备安装，应用即将重启… | 禁用 |
| error | 检查失败，请检查网络 | 重试 |

- 兜底「前往下载」：update-available 状态下额外提供小字链接（或按钮组），点击走现有 `open_external_url` 打开 GitHub Releases 页。
- 现有 `handleCheckUpdate` 中「后端失败后前端直接 fetch GitHub API」的降级逻辑**整体删除**（plugin 已覆盖检查职责）；`check_for_updates` 后端命令与 `is_newer_version` 删除。

### 5.2 主页面标题栏提示按钮

- 位置：`#titlebar .titlebar-left` 内、`.app-title`（「便签 Todo」）右侧，默认 `hidden`。
- 形态：小圆点/胶囊按钮（如「↑ 更新」或红点 + tooltip「发现新版本，点击查看」），不占拖拽区（不加 `data-tauri-drag-region`，Tauri 拖拽区仅作用于元素自身，子按钮可正常点击）。
- 交互：点击 → 打开设置面板（`settings-panel`），更新行高亮一次。**不在主页面直接触发下载**——下载确认统一收敛在设置页，避免误触（下载会重启应用）。
- 显隐：`updateState.status === 'update-available'` 时显示；安装完成（应用重启）后自然消失；用户手动检查确认已是最新后隐藏。

## 6. 签名与密钥管理

一次性操作（发版前置）：

1. 生成密钥对：`npx tauri signer generate -w <本地安全目录>\tauri-updater.key`（产出私钥文件 + 终端打印公钥）。
2. 私钥保管：仅存本地（如 `C:\Users\tang\keys\` 或密码管理器），**不进仓库**；`.gitignore` 增加 `*.key` 保险。
3. 公钥写入 `tauri.conf.json` → `plugins.updater.pubkey`。
4. 以后每次发版构建时提供私钥：`$env:TAURI_SIGNING_PRIVATE_KEY = "<私钥路径>"` 后再 `tauri build`（变量值为私钥文件路径；`TAURI_SIGNING_PRIVATE_KEY_PATH` 对打包器无效）。

## 7. 发版流程（变更点）

每次发版（以 0.3.0 为例）：

1. 版本号对齐：`Cargo.toml` + `tauri.conf.json` + 前端展示文案统一 bump。
2. 构建：设置 `$env:TAURI_SIGNING_PRIVATE_KEY = "<私钥路径>"` 后 `npx tauri build` → 产物目录生成 `Sticky Todo_0.3.0_x64-setup.exe` 和 `Sticky Todo_0.3.0_x64-setup.exe.sig`（**不含 latest.json**）。
3. 按 §2 格式**手动创建 `latest.json`**（`signature` 取 `.sig` 文件内容；`url` 暂按点号资产名写，上传后核对）。
4. GitHub 创建 release `v0.3.0`，上传资产：NSIS exe + `latest.json`（`.sig` 可不传，签名已内嵌 latest.json）。
5. 上传后用 `gh api repos/landfallbox/sticky-todo/releases/tags/v0.3.0` 的 `browser_download_url` **核对 `latest.json` 中的 exe URL**（空格→点号坑，见 §2）；不符则改 latest.json 后 `gh release upload v0.3.0 latest.json --clobber` 重传。
6. 验证：`curl -sL https://github.com/landfallbox/sticky-todo/releases/latest/download/latest.json` 确认 200 且 JSON 合法，并 GET 其中 `url` 确认 200；旧版本应用内点「检查更新」→ 下载 → 安装 → 重启为 0.3.0。

注意：**0.3.0 是第一个带签名的版本**。0.2.x 及更早用户无法通过内更升级到 0.3.0 之前也没有内更能力，所以 0.3.0 本身仍需用户手动从 GitHub 安装一次（发布说明中写明）；0.3.0 → 之后的版本即可全内更。

## 8. 配置与权限变更

- `tauri.conf.json`：
  - `version` → `0.3.0`
  - 新增 `plugins.updater`：`endpoints`（上述 GitHub URL）+ `pubkey`
- `src-tauri/Cargo.toml`：`version` → `0.3.0`；新增依赖 `tauri-plugin-updater = "2"`
- `src-tauri/src/main.rs`：`.plugin(tauri_plugin_updater::init())`；删除 `check_for_updates`、`is_newer_version` 及命令注册（`open_external_url` 保留作兜底）
- `src-tauri/capabilities/default.json`：permissions 增加 `"updater:default"`
- 前端：`src/index.html`（标题栏提示按钮 + 更新行兜底链接）、`src/assets/app.js`（updateState + 检查/下载逻辑重写 + 24h 定时器）、`src/assets/style.css`（提示按钮与进度样式）

## 9. 安全 / 合规 / 性能疑点

| 疑点 | 结论 |
|------|------|
| 供应链安全 | 安装包 ed25519 签名强校验 + HTTPS 端点，篡改即校验失败；私钥泄露风险由本地保管缓解（泄露需换公钥重发版，旧客户端拒绝新签名——可接受） |
| 隐私 | 检查/下载仅访问 GitHub 两个固定 URL，无遥测 |
| 无网/公司网 | 检查超时由 plugin 处理；自动检查失败静默，手动检查可重试；下载失败可重试并保留「前往下载」兜底 |
| 性能 | 检查仅一次小 JSON 请求；下载为整包 NSIS（预计 10MB 量级），仅用户点击后发生 |
| 权限 | `installMode: currentUser` 不变，无需 UAC；updater 走当前用户目录下载临时文件 |
| 兼容性风险 | 旧版 0.2.x 无内更能力，0.3.0 需手动安装一次（见 §7） |

## 10. 失败处理汇总

| 场景 | 行为 |
|------|------|
| 自动检查失败（无网等） | 静默，不清除已有「有新版本」状态，下个 24h 周期重试 |
| 手动检查失败 | 状态文字 + 「重试」按钮 |
| 下载中断/失败 | 回到 update-available，按钮恢复「下载并更新」，状态文字提示失败 |
| 安装失败（安装器报错） | 应用已退出，用户手动重启旧版；设置页保留「前往下载」兜底 |
| latest.json 缺失/格式错（如忘传资产） | check 抛错，按检查失败处理；发版验证步骤（§7.4）前置拦截 |
