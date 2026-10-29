# Intent：Release Notes 版本化 Changelog

> 状态：已确认（2026-10-29 用户确认两项决策，仅剩 git-cliff 运行方式待 spec 阶段实测）
> 日期：2026-10-29

## 当前问题

- `.github/workflows/release.yml` 中 `releaseBody` 是硬编码的静态文案，导致 v0.1.0 ~ v0.2.0 每个版本的 GitHub Release notes 完全相同，只有版本号不同。
- notes 里没有任何"本版本改了什么"的 changelog，用户升级后无法感知变化，"检查软件更新"功能的价值被削弱。
- 仓库内没有 `CHANGELOG.md`，版本历史没有留档，只能靠翻 commit 历史。

## 期望结果

- 发布新版本时，GitHub Release notes **自动**包含按 Conventional Commits 分类的 changelog（如 ✨ 新功能 / 🐛 修复 / ⚙️ 构建与配置），**changelog 置于 notes 开头**，后接现有下载说明，无需人工编写。
- 仓库内同步维护一份 `CHANGELOG.md`（Keep a Changelog 格式，中文），版本历史留档在版本控制里。
- 发布操作保持现状：打 tag 推送即可，零额外手工步骤。

## 受影响系统

| 系统 | 影响 |
|------|------|
| `.github/workflows/release.yml` | 新增 changelog 生成步骤，`releaseBody` 改为动态内容；生成后把 CHANGELOG.md 提交回仓库 |
| `CHANGELOG.md`（新增，仓库根目录） | 由 git-cliff 生成/更新 |
| `cliff.toml`（新增，仓库根目录） | git-cliff 配置：commit type → 中文分类名映射、排除 merge / `chore(release)` 等噪音提交 |
| 开发者提交习惯 | commit message 需遵循 Conventional Commits（现有 custom-commit-msg skill 已生成 Angular 格式，无额外负担；早期非规范提交不追溯） |

**不受影响**：应用内更新检查（只取版本号与 release 链接，不读 notes 正文）、前端代码、Rust 后端、资产构建与上传逻辑。

## 数据/技术约束

- 发布流水线运行在 `windows-latest` runner；git-cliff 的 Windows 运行方式（预编译二进制 or 官方 `orhun/git-cliff-action`）需在 spec 阶段验证。
- `tauri-action` 的 `releaseBody` 是 YAML 静态字符串，动态化需先写文件再经 step output 传入，多行 Markdown 的传递方式需在 plan 阶段落实。
- CHANGELOG.md 写回仓库的 push 不能触发工作流死循环（工作流仅由 tag push / workflow_dispatch 触发，写回的是 main 上的普通 commit，天然安全，需在 plan 中确认）。
- 版本号来源为 git tag（`v*`），需保证 tag 与 `tauri.conf.json` / `package.json` 中版本一致（现状一致，由 `chore(release)` 提交维护）。

## 明确不做的事

- 不回填、不重写已有 v0.1.0 ~ v0.2.0 的 release notes。
- 不改变发布触发方式（仍为 tag push / workflow_dispatch）与资产清单。
- 不引入 release-please / release-drafter 等重型发布工具。
- 不修改应用内更新检查逻辑与前后端代码。

## 已确认决策

1. **CHANGELOG.md 更新策略**：每次**完整生成**（含全部历史版本，幂等、可 diff 审查）。
2. **changelog 在 release notes 中的位置**：置于**开头**（"本版本更新"优先），下载说明在后。

## 待确认问题

1. **git-cliff 在 windows-latest 上的运行方式**：预编译二进制下载 vs `orhun/git-cliff-action`，spec 阶段实测后定。
