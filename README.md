# Sticky Todo (便签 Todo) ✦

一个轻量、现代且性能极致的 Windows 桌面便签 TODO-List 应用。基于 **Tauri 2 + Rust + 原生 Web** 构建，深度融合 Windows 11 Fluent Design 与原生 DWM 窗口吸附体验。

![Platform](https://img.shields.io/badge/Platform-Windows-blue?logo=windows)
![Framework](https://img.shields.io/badge/Framework-Tauri%20v2-24C8DB?logo=tauri)
![Language](https://img.shields.io/badge/Language-Rust%20%7C%20HTML%2FCSS%2FJS-DEA584?logo=rust)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ 核心特性

- 🪶 **极致轻量 & 低占用**：Rust 原生内核 + 系统 WebView2，内存占用仅约 20MB ~ 35MB，启动毫秒级，后台常驻零负担。
- 🎨 **现代 Fluent / WinUI 3 风格**：
  - Windows 11 原生 DWM 圆角与投影
  - 优雅的极简浅色主题界面与毛玻璃质感
  - 平滑的操作动画与微交互
- 🧲 **智能边缘吸附与隐藏（Edge Dock & Auto-Collapse）**：
  - **自动吸附**：将便签拖拽到屏幕左边缘、右边缘或顶部（<40px）松手即可自动紧贴屏幕边缘。
  - **优雅折叠**：鼠标离开便签超过 350ms 后，窗口自动平滑收缩进屏幕边缘，仅保留精致的 **16px 蓝色提手挂耳（Peek Tab）**，不干扰日常桌面操作。
  - **灵敏唤醒**：鼠标滑向边缘触碰或点击挂耳，便签立即以 **240ms 三次方减速曲线（Cubic Ease-Out）** 优雅滑出展开。
  - **自由拉出**：拖动标题栏离开屏幕边缘，即可随时退出吸附模式恢复普通悬浮。
- 📝 **完善的 TODO 清单管理**：
  - 快速添加待办（Enter 键即时提交）
  - 单击圆形复选框完成 / 取消完成
  - 双击待办文本直接原地编辑（Enter 确认，Esc 取消）
  - 悬停快捷删除（带平滑滑动移出动画）
  - 拖拽待办项实时调整顺序
  - 一键清理已完成待办
- 💾 **本地安全持久化**：
  - 数据存储于 `%LOCALAPPDATA%\StickyTodo\todos.json`，无任何云端上传，零隐私泄露风险。
- ⚙️ **偏好设置与后台常驻**：
  - **开机自启动开关**：内置无权限门槛的开机自启切换（写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`），电脑开机自动在后台就绪。
  - **窗口置顶切换**：可自由切换是否始终悬浮于其他窗口上方。
  - **检查软件更新**：设置面板提供一键检测更新功能，自动比对 GitHub 最新发行版并提供一键跳转下载。
  - **优雅托盘托管**：点击右上角关闭按钮自动退至系统托盘，双击托盘图标即可随时唤起。
- 📦 **云端 CI 自动构建 & 现代安装程序**：
  - 由 GitHub Actions 全自动流水线在云端编译生成 Windows NSIS 安装包（Setup.exe）与免安装绿色版。
  - 安装包自动部署并注册桌面与开始菜单快捷方式，支持系统一键卸载。

---

## 🚀 快速开始

### 📥 从 GitHub Releases 下载安装（推荐）

直接前往 [Releases 页面](https://github.com/landfallbox/sticky-todo/releases) 下载最新发行版：
- **安装包（推荐）**：下载 `Sticky.Todo_x64-setup.exe`，一键自动安装并创建开始菜单和桌面快捷方式。
- **免安装绿色版**：下载 `sticky-todo.exe`，解压即用。

---

### 从源码编译

#### 1. 环境准备
- [Rust 工具链](https://rustup.rs/) (1.70+)
- [Node.js](https://nodejs.org/) (LTS，提供 `npm`；`npm run` 脚本依赖它)
- Windows 10 / Windows 11 (内置 Microsoft Edge WebView2)
- [Tauri CLI v2](https://v2.tauri.app/start/):
  ```bash
  cargo install tauri-cli --version "^2"
  ```

#### 2. 克隆项目与编译
```bash
git clone https://github.com/landfallbox/sticky-todo.git
cd sticky-todo

# 安装 npm 依赖（提供 `tauri` 命令，供 npm run 脚本使用）
npm install

# 开发模式（热重载）
cargo tauri dev

# 开发模式（数据隔离，推荐日常开发用）
# 数据写入 %LOCALAPPDATA%\StickyTodo-dev，不会覆盖正式版的真实数据
npm run dev:isolated

# 编译生成独立发布版本
cargo tauri build
```

编译产物将生成在 `src-tauri/target/release/` 下。

---

## ⌨️ 快捷操作说明

| 操作 | 效果 |
|---|---|
| `Enter` | 在输入框中快速添加新待办 |
| `单击复选框` | 切换待办完成状态 |
| `双击任务文本` | 进入即时编辑模式（`Enter` 保存，`Esc` 取消） |
| `鼠标悬停条目` | 显示右侧快捷删除按钮 |
| `拖动条目` | 重新排列待办顺序 |
| `拖动标题栏贴边` | 自动吸附到屏幕左/右/上边缘 |
| `鼠标离开` | 吸附状态下自动收缩入边缘，保留蓝色挂耳 |
| `触碰边缘挂耳` | 平滑呼出展开便签窗口 |
| `拖动标题栏拉向屏幕中央` | 退出贴边吸附，恢复自由悬浮模式 |
| `右上角 ✕ 按钮` | 隐藏至系统托盘（后台常驻） |

---

## 📄 开源许可

本项目基于 [MIT License](LICENSE) 开源。
