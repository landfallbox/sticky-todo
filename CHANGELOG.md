# Changelog

本文件由 git-cliff 自动生成，请勿手动编辑。
<!-- git-cliff: end of header -->
## 0.3.1 (2026-11-01)

### 🐛 修复

- (ci) 处理 CodeRabbit 审查意见（changelog 健壮性/版本区间/回写冲突）

- (ci) 限定 prev-tag 匹配版本模式，回写 changelog 改从 main 历史生成

- (ci) 锚定 git-cliff tag_pattern 避免非版本 tag 成为 release 边界

- (theme) 提升深色模式质感，修复 todo 项对齐与窄窗口 placeholder 裁切

- (theme) 修复 CI 格式检查，设置面板补全 Acrylic 不透明回退


### 📝 文档

- (sdlc) 修正 latest.json 生成方式与资产名空格转点号说明


### 🔧 CI

- (release) 工作流注入签名密钥并自动生成上传 latest.json


### ⚙️ 其他

- (ci) 升级 checkout/setup-node 至 v7 消除 Node 20 弃用警告

## 0.3.0 (2026-10-29)

### ✨ 新功能

- (updater) 支持软件内自动更新，替代手动下载


### 🐛 修复

- (updater) 处理 CodeRabbit 审查意见（竞态/超时/失败提示/版本读取/隐藏规则）

- (updater) 处理 CodeRabbit 复审意见（失败路径竞态守卫/签名密钥仅 build 需要）

## 0.2.1 (2026-10-29)

### ✨ 新功能

- (release) 发布说明版本化 changelog（git-cliff 自动生成）


### 🐛 修复

- (ci) 修正 git-cliff 安装步骤的 action 引用格式

## 0.2.0 (2026-10-28)

### ✨ 新功能

- (theme) 新增深色模式与跟随系统主题切换 (#2)

- (store) 支持 STICKYTODO_DATA_DIR 环境变量隔离开发数据 (#4)

- (todo) 悬停时显示编辑按钮，提升编辑功能可发现性 (#1)

- (input) 输入框与编辑框支持自适应高度多行输入


### 🐛 修复

- (window) 启动时恢复上次关闭的窗口位置与停靠/折叠状态

- (window) 处理 CodeRabbit 审查意见（溢出/钳制/失败回退/OS 关闭落盘）

- (input) 修复输入法合成期 Enter 误提交与高度下限


### 📝 文档

- (input) 为本次改动的函数补充 JSDoc 注释


### 🔧 CI

- 新增 PR 门禁流水线（构建 + 静态检查） (#3)


### ⚙️ 其他

- 提交 package-lock.json 锁定依赖版本

- 忽略 tauri 自动生成的 gen/schemas 并移除跟踪

## 0.1.2 (2026-10-27)

### 🐛 修复

- eliminate peek tab flashing on expand with pre-animation hide and opacity transition

## 0.1.1 (2026-10-27)

### ✨ 新功能

- add settings panel with autostart toggle and NSIS installer

- add CI release workflow with NSIS installer build and in-app update checker


### ⚙️ 其他

- ignore zip archives

## 0.1.0 (2026-10-27)

### ✨ 新功能

- initial release of Sticky Todo v0.1.0

