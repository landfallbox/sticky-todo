# Changelog

本文件由 git-cliff 自动生成，请勿手动编辑。
<!-- git-cliff: end of header -->
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

