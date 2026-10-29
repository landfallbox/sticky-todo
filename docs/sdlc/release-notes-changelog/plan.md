# Plan：Release Notes 版本化 Changelog

> 状态：已执行（本地验证通过，待下次 tag 发布做端到端验证）
> 日期：2026-10-29
> 上游产物：[intent.md](./intent.md)（已确认）· [spec.md](./spec.md)（已确认）

## 改动文件（按实现顺序）

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `cliff.toml` | 新增 | git-cliff 配置：中文分组映射、噪音提交过滤、changelog 模板（git-cliff 2.x 自动发现 `cliff.toml`，非 `.git-cliff.toml`） |
| 2 | `.github/workflows/release.yml` | 修改 | 加 `fetch-depth: 0`、git-cliff 步骤、body 组装步骤、`releaseBody` 动态化、CHANGELOG 回提交步骤 |
| 3 | `CHANGELOG.md` | 不手工创建 | 首次发布时由流水线生成并提交回 main |
| 4 | `.gitignore` | 检查 | 确认含 `tmp/`（本地验证用），没有则补 |

**不改动**：前端、Rust、资产上传逻辑、应用内更新检查。

## 实现步骤

### 步骤 1：创建 `cliff.toml`

要点（完整内容在实现时落盘）：

- `[changelog]`：
  - `header`：`# Changelog` + "本文件由 git-cliff 自动生成，请勿手动编辑。"
  - `body`：自定义模板 —— `## {name} ({date})` 版本头 + 按 `group` 分组的 `### {group}` + 提交行 `- ({scope}) {message}`（scope 为空时省略括号，用 tera `{% if %}`）
- `commit_parsers`（type → 中文分组）：
  - `^feat` → `✨ 新功能`、`^fix` → `🐛 修复`、`^perf` → `⚡ 性能`、`^refactor` → `♻️ 重构`、`^docs` → `📝 文档`、`^style` → `🎨 样式`、`^test` → `🧪 测试`、`^build` → `📦 构建`、`^ci` → `🔧 CI`、`^chore` → `⚙️ 其他`
  - `skip = true`：`^chore\(release\)`（版本升级噪音）、`^docs\(changelog\)`（回提交噪音）
- merge 提交 git-cliff 默认忽略，无需额外配置
- 版本号边界来自 git tag（`v*`），与 tag 推送发布方式天然对齐

### 步骤 2：本地验证 git-cliff 输出

1. 本机安装 git-cliff（winget 或 GitHub release 二进制）
2. 在仓库执行：
   - `git-cliff -o tmp/CHANGELOG.md`（全量）
   - `git-cliff --latest --strip header -o tmp/RELEASE_NOTES.md`（v0.1.2 → v0.2.0 区间）
3. 检查：中文分组渲染、scope 括号、`chore(release)` 被过滤、版本头日期格式
4. 不符合预期则迭代 `cliff.toml` 后重跑

### 步骤 3：修改 `release.yml`

在现有 `build-and-release` job 内按序插入/修改（其余步骤原样保留）：

1. **Checkout**：加 `with: fetch-depth: 0`（git-cliff 需要全量历史）
2. **新增 Install git-cliff**：`uses: taiki-e/install-action@git-cliff`
3. **新增 Generate changelog**：
   ```
   git-cliff -o CHANGELOG.md
   git-cliff --latest --strip header -o RELEASE_NOTES.md
   ```
   并 `Get-Content` 两个文件打印到日志（便于排查）
4. **新增 Assemble release body**（`id: release-body`，PowerShell）：
   - 取 tag（沿用现有 `ref_name || inputs.tag_name` 判断模式）
   - `RELEASE_NOTES.md`（存在且非空时）+ 空行 + 现有下载说明文案（版本号用 `$tag` 插值）→ 拼成完整 body
   - body 为空则 `throw`（fail-fast，避免发布无 notes 的 release）
   - 用 heredoc 写入 step output：`"BODY<<EOF" | Out-File $env:GITHUB_OUTPUT -Encoding utf8` → body 内容 → `"EOF"`（**必须显式 `-Encoding utf8`**，PS 5.1 默认 UTF-16 会破坏解析）
5. **tauri-action**：`releaseBody: ${{ steps.release-body.outputs.BODY }}`（替换原静态文案）
6. **新增 Commit CHANGELOG.md back to main**（置于资产上传之后）：
   ```powershell
   Copy-Item CHANGELOG.md "$env:RUNNER_TEMP/CHANGELOG.md"   # 防御 tag 与 main 文件不一致
   git config user.name 'github-actions[bot]'
   git config user.email 'github-actions[bot]@users.noreply.github.com'
   git checkout main
   git pull --rebase origin main
   Copy-Item "$env:RUNNER_TEMP/CHANGELOG.md" CHANGELOG.md -Force
   git add CHANGELOG.md
   if (-not (git diff --cached --quiet)) {
     git commit -m "docs(changelog): update CHANGELOG.md"
     git push origin main
   }
   ```
   - 触发安全：工作流仅 tag/dispatch 触发，main 普通 commit 不会死循环
   - 回提交消息 `docs(changelog):` 已被步骤 1 的 skip 规则过滤，不会污染下个版本的 changelog

### 步骤 4：验证

见下方"验证命令"。

## 可能破坏的已有功能

| 风险 | 影响 | 缓解 |
|------|------|------|
| git-cliff 步骤失败 | 发布在构建前中止（fail-fast） | 步骤 2 本地验证先行；CI 日志可见错误 |
| `releaseBody` 动态化后为空/乱码 | release notes 缺失或编码错误 | 组装步骤空 body 直接 throw；显式 UTF-8；本地模拟验证 |
| `fetch-depth: 0` | 无（仓库历史小，仅 checkout 略慢） | — |
| CHANGELOG 回提交 | main 多一个 commit；若 push 冲突导致步骤失败，release 本身已发布，仅留档缺失 | `pull --rebase` 兜底；内容无变化时跳过提交 |
| 应用内更新检查/前端/Rust/资产 | 无影响（不读 notes 正文；资产逻辑不动） | — |

## 验证命令

1. **git-cliff 本地生成**（步骤 2 已含）：
   ```powershell
   git-cliff -o tmp/CHANGELOG.md
   git-cliff --latest --strip header -o tmp/RELEASE_NOTES.md
   ```
   人工检查分组、跳过规则、中文、scope 渲染。
2. **YAML 语法校验**：
   ```powershell
   python -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml', encoding='utf-8')); print('yaml ok')"
   ```
   （python 不可用时退化为 `npx js-yaml .github/workflows/release.yml`）
3. **body 组装步骤本地模拟**：把步骤 3.4 的 pwsh 片段在本地 shell 跑一遍，`$env:GITHUB_OUTPUT` 指向 `tmp/output.txt`，检查 heredoc 结构（`BODY<<EOF` 首行、`EOF` 末行、内容换行与中文编码）。
4. **E2E（可选，需你明确批准）**：推一个测试 tag 触发真实发布 → 检查 release notes 与 CHANGELOG 回提交 → 删除测试 release 与 tag。涉及真实发布操作，默认**不执行**。
5. CI 门禁（`cargo fmt/clippy/build`、`node --check`）不覆盖 workflow 文件，本次改动无需跑；如后续改动涉及 Rust/前端再跑。

## 最容易出问题的步骤 & 备选方案

**最容易出问题**：步骤 3.4 的多行 release body 传递（pwsh heredoc → `GITHUB_OUTPUT` → tauri-action `releaseBody`）。三个坑：PS 5.1 默认 UTF-16 编码、BOM、heredoc 分隔符出现在内容中。验证 3 的本地模拟专门覆盖这一点。

**备选方案**：若 step output 机制实测不稳，改用 `gh release edit`：
- tauri-action 的 `releaseBody` 保留现有静态下载说明（兜底，保证 notes 不空）
- 资产上传后新增一步：`gh release edit $tag --notes-file <完整 body 文件>`
- 优点：完全绕过多行 output 传递，`gh` 已在 workflow 中使用；缺点：notes 短暂不完整（发布到更新之间几秒~几分钟），且 body 文件需在 job 内落盘组装

**回滚**：改动集中在 `release.yml` + 新增配置，出问题直接 revert 两个文件即可恢复原静态 notes 行为；已生成的 `CHANGELOG.md` 可保留（无害）。

## 收尾

- 清理 `tmp/` 下本地验证产物
- 三份产物（intent/spec/plan）与代码改动一并提交（提交时机等你指示）
