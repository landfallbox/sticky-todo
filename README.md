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
- 📌 **桌面与托盘整合**：
  - 窗口支持置顶与拖动
  - 点击关闭按钮自动最小化至系统托盘，随时从托盘双击恢复。

---

## 🚀 快速开始

### 直接下载使用

前往 [Releases 页面](https://github.com/landfallbox/sticky-todo/releases) 下载最新版的独立免安装可执行程序 `sticky-todo.exe`，双击即可直接运行！

---

### 从源码编译

#### 1. 环境准备
- [Rust 工具链](https://rustup.rs/) (1.70+)
- Windows 10 / Windows 11 (内置 Microsoft Edge WebView2)
- [Tauri CLI v2](https://v2.tauri.app/start/):
  ```bash
  cargo install tauri-cli --version "^2"
  ```

#### 2. 克隆项目与编译
```bash
git clone https://github.com/landfallbox/sticky-todo.git
cd sticky-todo

# 开发模式（热重载）
cargo tauri dev

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
