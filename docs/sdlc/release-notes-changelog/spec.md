# Spec：Release Notes 版本化 Changelog

> 状态：待确认
> 日期：2026-10-29
> 上游产物：[intent.md](./intent.md)（已确认）

## 1. 功能如何工作

发布流程（tag push 触发）变为：

```
push tag v0.x.y
  └─ release.yml
       ├─ checkout（fetch-depth: 0，拉全量历史）
       ├─ 安装 git-cliff（taiki-e/install-action）
       ├─ git-cliff -o CHANGELOG.md              ← 全量历史，完整重写（幂等）
       ├─ git-cliff --latest --strip header      ← 仅上个 tag 至今的提交
       │    -o RELEASE_NOTES.md
       ├─ pwsh 步骤：RELEASE_NOTES.md + 下载说明
       │    → 组装完整 release body → 写入 step output
       ├─ tauri-action：构建 + 创建 Release
       │    releaseBody = 动态 step output
       ├─ 上传 standalone exe / zip（现有逻辑不变）
       └─ 将 CHANGELOG.md 提交回 main（github-actions[bot]）
```

### Release notes 最终形态

```markdown
## v0.3.0 (2026-11-01)

### ✨ 新功能
- (input) 输入框与编辑框支持自适应高度多行输入
- ...

### 🐛 修复
- (window) 启动时恢复上次关闭的窗口位置与停靠/折叠状态
- ...

### 📦 下载与安装 (Assets)
- **推荐安装包**：下载下方的 `Sticky Todo_v0.3.0_x64-setup.exe`（...）
- **单文件免安装绿色版**：...
```

changelog 在开头（用户已确认），下载说明在后（沿用现有文案，版本号仍是 `${{ github.ref_name || inputs.tag_name }}` 插值）。

### 仓库内 CHANGELOG.md 形态

```markdown
# Changelog

本文件由 git-cliff 自动生成，请勿手动编辑。

## v0.3.0 (2026-11-01)

### ✨ 新功能
- ...

## v0.2.0 (2026-10-28)

### ✨ 新功能
- ...
（每次发布完整重写，含全部历史版本；不回填 v0.1.0 之前的内容，
  首个版本段落从启用本流程的版本开始）
```

## 2. 数据如何流动

| 数据 | 来源 | 去向 |
|------|------|------|
| 提交历史 | git 仓库（`fetch-depth: 0` 保证全量） | git-cliff 解析 |
| 版本边界 | git tag（`v*`，全部位于 main 上，已验证 v0.1.0~v0.2.0 均在 main） | `--latest` 以上一个 tag 为起点 |
| 分类映射 | `cliff.toml` 的 `commit_parsers`（type → 中文分组名） | changelog 分组标题 |
| 单版本 notes | `git-cliff --latest` 输出 `RELEASE_NOTES.md` | pwsh 步骤拼接下载说明 → step output |
| 完整 changelog | `git-cliff` 全量输出 `CHANGELOG.md` | ① 作为仓库文件提交回 main ② 版本历史留档 |
| release body | step output（多行，heredoc 方式写入 `$env:GITHUB_OUTPUT`） | `tauri-action` 的 `releaseBody` 输入 |

**不受影响的数据流**：应用内更新检查只读 `releases/latest` 的 `tag_name` 与 `html_url`（[app.js](../../../src/assets/app.js) 第 233-256 行），不解析 notes 正文，notes 结构变化对它透明。

## 3. 影响哪些系统

| 文件 | 变更 |
|------|------|
| `.github/workflows/release.yml` | checkout 加 `fetch-depth: 0`；新增 git-cliff 安装与生成步骤、body 组装步骤、CHANGELOG 回提交步骤；`releaseBody` 改为引用 step output |
| `cliff.toml`（新增） | 中文分组映射、跳过 `chore(release)` 提交、changelog header |
| `CHANGELOG.md`（新增，首次发布时由流水线创建） | 自动维护，不手工编辑 |
| 其余（前端/Rust/资产上传/更新检查） | 不动 |

### 回提交 main 的触发安全

工作流触发器只有 `push: tags: 'v*'` 与 `workflow_dispatch`。CHANGELOG 回提交是 main 上的普通 commit，**不会**再次触发工作流，无死循环风险。

### 已知既有怪癖（不在本次范围）

`workflow_dispatch` 路径下 `github.ref_name` 是分支名（如 `main`），现有 `tagName: ${{ github.ref_name || inputs.tag_name }}` 在手动触发时会取到分支名而非 tag。这是既有问题，本次不修，但新步骤在 dispatch 路径下会退化为"基于 main HEAD 生成"，不会比现状更糟。

## 4. 关键技术决策（已验证）

1. **git-cliff 运行方式**：`taiki-e/install-action@git-cliff`（下载官方预编译 Windows 二进制，跨平台可靠），同一 job 内执行两次命令（全量 + `--latest`），避免重复下载。
   - 备选 `orhun/git-cliff-action@v4` 也可用（自带下载逻辑、提供 `content` output），但两次调用会重复下载二进制，故选 install-action + 手动执行。
2. **多行 release body 传递**：PowerShell 下用 heredoc 写 step output（`"BODY<<EOF" | Add-Content $env:GITHUB_OUTPUT` … `"EOF" | Add-Content $env:GITHUB_OUTPUT`），这是 GitHub 官方文档的 PowerShell 多行 output 模式；`tauri-action` 的 `releaseBody` 是普通字符串输入，`${{ steps.x.outputs.BODY }}` 可完整保留换行。
3. **版本号一致性**：tag（`v0.2.0`）、`package.json`（`0.2.0`）、`tauri.conf.json`（`0.2.0`）三者现状一致，由 `chore(release)` 提交维护，git-cliff 以 tag 为版本边界，无需额外校验步骤。
4. **`chore(release)` 噪音提交**：在 `commit_parsers` 中用 `skip = true` 过滤"版本号升级"提交，避免每个版本 notes 里都出现一条无意义的 chore。merge 提交 git-cliff 默认忽略。

## 5. 安全 / 合规 / 性能疑点

- **token 权限**：CHANGELOG 回提交需要向 main push。现有 workflow 已有 `permissions: contents: write`，`GITHUB_TOKEN` 足够，不新增权限、不引入新 secret。
- **信息泄露**：changelog 只含 commit message 文本，无敏感信息风险；commit message 本身已公开在仓库。
- **性能**：`fetch-depth: 0` 使 checkout 从浅克隆变全量克隆，本仓库历史小（<50 提交），可忽略；git-cliff 生成毫秒级。
- **失败模式**：若 git-cliff 步骤失败，workflow 在构建前即中止，不会产生"无 changelog 的 release"（fail-fast 是期望行为）。CHANGELOG 回提交失败（如 push 冲突）只影响留档，release 本身已发布——该步骤用 `continue-on-error: false` 但置于发布完成之后，且提交前 `git pull --rebase` 兜底。

## 6. 边界情况

| 场景 | 行为 |
|------|------|
| 首个启用本流程的版本（无历史 CHANGELOG.md） | git-cliff 全量生成时，v0.1.0~v0.2.0 的提交也会被纳入（tag 都在 main 上且历史完整）。若希望"从新版本开始"，可用 `git-cliff --topo-order-only` 之外的 tag 过滤（`tag_filter = "^v0\.3\..*"` 之类）——实现时二选一，倾向**纳入历史**（反正不回填 GitHub notes，仓库内留档反而补上了缺口） |
| 某版本间只有 chore/merge 提交 | `--latest` 输出可能为空或只剩被跳过的分组 → RELEASE_NOTES.md 可能为空文件，release body 退化为只有下载说明（可接受，不报错） |
| tag 打在非 main 分支 | 回提交仍推 main；`--latest` 基于 tag 可达历史，内容正确。现状 tag 均在 main，此场景仅防御性覆盖 |
| 同一 tag 重复触发（re-run） | tauri-action 对已存在的 release 会复用/更新；CHANGELOG 提交因内容相同（`git diff --quiet` 检查）跳过提交 |

## 7. 明确不做（与 intent 一致）

- 不回填 v0.1.0 ~ v0.2.0 的 GitHub release notes
- 不改触发方式与资产清单
- 不动应用内更新检查与前后端代码
- 不修 `workflow_dispatch` 的 `ref_name` 既有怪癖
