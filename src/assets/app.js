// ─────────────────────────────────────────────────────
// Sticky Todo — Frontend Logic
// ─────────────────────────────────────────────────────

function getInvoke() {
  if (window.__TAURI__?.core?.invoke) return window.__TAURI__.core.invoke;
  if (window.__TAURI_INTERNALS__?.invoke) return window.__TAURI_INTERNALS__.invoke;
  return null;
}

async function invoke(cmd, args = {}) {
  const fn = getInvoke();
  if (!fn) {
    console.warn('Invoke not ready for command:', cmd);
    return [];
  }
  return await fn(cmd, args);
}

// ── DOM Elements ────────────────────────────────────

const todoInput = document.getElementById('todo-input');
const btnAdd = document.getElementById('btn-add');
const todoList = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');
const statsText = document.getElementById('stats-text');
const btnClearDone = document.getElementById('btn-clear-done');
const btnMinimize = document.getElementById('btn-minimize');
const btnClose = document.getElementById('btn-close');
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsPanel = document.getElementById('settings-panel');
const switchAutostart = document.getElementById('switch-autostart');
const switchAlwaysOnTop = document.getElementById('switch-always-on-top');
const btnCheckUpdate = document.getElementById('btn-check-update');
const updateStatusText = document.getElementById('update-status-text');
const btnUpdateHint = document.getElementById('btn-update-hint');
const linkGithubRelease = document.getElementById('link-github-release');
const appVersionFooter = document.getElementById('app-version-footer');
const themeSegmented = document.getElementById('theme-segmented');

const THEME_KEY = 'sticky-todo:theme';
const THEME_MODES = ['light', 'dark', 'system'];
let systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

let todos = [];
let dragSrcId = null;

// ── Initialization ──────────────────────────────────

async function init() {
  try {
    const res = await invoke('get_todos');
    if (Array.isArray(res)) {
      todos = res;
    }
  } catch (err) {
    console.error('Failed to load todos:', err);
  }

  // Load autostart status
  try {
    const autostart = await invoke('get_autostart');
    if (switchAutostart) {
      switchAutostart.checked = !!autostart;
    }
  } catch (err) {
    console.error('Failed to check autostart:', err);
  }

  setupTheme();
  render();
  setupEventListeners();
  setupDockListeners();
  restoreDockState();
  initUpdateChecker();
}

// ── Theme ───────────────────────────────────────────

function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (THEME_MODES.includes(v)) return v;
  } catch (err) {
    console.warn('Failed to read theme preference:', err);
  }
  return 'system';
}

function applyTheme(mode) {
  const dark = mode === 'dark' || (mode === 'system' && systemDarkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function setTheme(mode) {
  if (!THEME_MODES.includes(mode)) return;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch (err) {
    console.warn('Failed to persist theme preference:', err);
  }
  applyTheme(mode);
  syncThemeControl(mode);
}

function syncThemeControl(mode) {
  if (!themeSegmented) return;
  themeSegmented.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeMode === mode);
  });
}

function setupTheme() {
  const mode = getStoredTheme();
  applyTheme(mode);
  syncThemeControl(mode);

  if (systemDarkQuery.addEventListener) {
    systemDarkQuery.addEventListener('change', () => {
      if (getStoredTheme() === 'system') applyTheme('system');
    });
  }

  if (themeSegmented) {
    themeSegmented.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-theme-mode]');
      if (btn) setTheme(btn.dataset.themeMode);
    });
  }
}

// ── Event Listeners ─────────────────────────────────

/**
 * 绑定添加框、窗口控制、主题与拖拽等全局事件。
 * 添加框 Enter 提交（Shift+Enter 换行、IME 合成期不触发），input 事件触发高度自适应。
 */
function setupEventListeners() {
  // Add todo
  btnAdd.addEventListener('click', addTodo);
  todoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      addTodo();
    }
  });
  todoInput.addEventListener('input', () => autoResize(todoInput));

  // Window controls
  btnMinimize.addEventListener('click', () => invoke('minimize_window'));
  btnClose.addEventListener('click', () => invoke('hide_window'));

  // Settings
  if (btnSettings && settingsPanel) {
    btnSettings.addEventListener('click', () => {
      settingsPanel.classList.toggle('hidden');
    });
  }
  if (btnCloseSettings && settingsPanel) {
    btnCloseSettings.addEventListener('click', () => {
      settingsPanel.classList.add('hidden');
    });
  }

  // Switches
  if (switchAutostart) {
    switchAutostart.addEventListener('change', async () => {
      try {
        await invoke('set_autostart', { enable: switchAutostart.checked });
      } catch (err) {
        console.error('Failed to set autostart:', err);
      }
    });
  }

  if (switchAlwaysOnTop) {
    switchAlwaysOnTop.addEventListener('change', async () => {
      try {
        await invoke('set_always_on_top', { alwaysOnTop: switchAlwaysOnTop.checked });
      } catch (err) {
        console.error('Failed to set always_on_top:', err);
      }
    });
  }

  // Update checker
  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener('click', () => {
      if (updateState.status === 'update-available') {
        handleDownloadAndInstall();
      } else {
        handleCheckUpdate();
      }
    });
  }
  if (btnUpdateHint) {
    btnUpdateHint.addEventListener('click', openSettings);
  }
  if (linkGithubRelease) {
    linkGithubRelease.addEventListener('click', (e) => {
      e.preventDefault();
      invoke('open_external_url', { url: GITHUB_RELEASES_URL }).catch(() => {
        window.open(GITHUB_RELEASES_URL, '_blank');
      });
    });
  }

  // Clear completed
  btnClearDone.addEventListener('click', clearCompleted);
}

// ── Update Checker ──────────────────────────────────

const GITHUB_RELEASES_URL = 'https://github.com/landfallbox/sticky-todo/releases';
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 运行中超过 24h 自动再查一次
let APP_VERSION = '0.3.0'; // 兜底值，init 时从 core:app:version 读取实际值

const updateState = {
  // idle | checking | up-to-date | update-available | downloading | installing | error
  status: 'idle',
  latestVersion: null,
  releaseNotes: null,
  lastCheckedAt: 0,
  downloaded: 0,
  total: 0,
  downloadFailed: false, // 下载/安装失败标记，供 renderUpdateUI 显示失败文案
  update: null, // updater.check() 返回的 Update 实例，downloadAndInstall 是其实例方法
};

function openSettings() {
  if (settingsPanel) settingsPanel.classList.remove('hidden');
}

/**
 * 取 withGlobalTauri 注入的 updater 全局 API（插件 api-iife.js 自动挂载到 __TAURI__.updater）。
 * 本应用无打包器、不走 npm 包；API 不可用时返回 null，调用方据此走错误/降级分支。
 * @returns {{check: Function}|null} updater 命名空间或 null
 */
function getUpdaterApi() {
  const g = window.__TAURI__?.updater;
  if (g && typeof g.check === 'function') return g;
  return null;
}

/**
 * 执行一次更新检查并更新共享状态。
 * @param {boolean} silent 静默模式：不进入 checking 态、不弹错误（用于启动/每日自动检查）。
 *   发现新版本时仍会点亮提示按钮；下载/安装进行中会跳过本次结果，避免覆盖进行中的状态。
 */
async function runUpdateCheck(silent) {
  if (updateState.status === 'downloading' || updateState.status === 'installing') return;
  const api = getUpdaterApi();
  if (!api) {
    if (!silent) {
      updateState.status = 'error';
      renderUpdateUI();
    }
    return;
  }
  if (!silent) {
    updateState.status = 'checking';
    renderUpdateUI();
  }
  try {
    const update = await api.check({ timeout: 15000 });
    // await 期间用户可能已发起下载/安装，此时丢弃本次结果，避免回写覆盖进行中的状态
    if (updateState.status === 'downloading' || updateState.status === 'installing') return;
    updateState.lastCheckedAt = Date.now();
    if (update) {
      updateState.status = 'update-available';
      updateState.update = update;
      updateState.latestVersion = update.version;
      updateState.releaseNotes = update.body || null;
    } else {
      updateState.update = null;
      if (updateState.status === 'update-available') {
        // 静默复查发现已无更新（如 release 已撤）：清除过期的 update-available
        updateState.status = silent ? 'idle' : 'up-to-date';
      } else if (!silent && updateState.status === 'checking') {
        updateState.status = 'up-to-date';
      }
    }
  } catch (err) {
    console.warn('Update check failed:', err);
    if (!silent) updateState.status = 'error';
  }
  renderUpdateUI();
}

/** 手动检查入口：非静默执行一次更新检查（按钮触发）。 */
async function handleCheckUpdate() {
  await runUpdateCheck(false);
}

/**
 * 下载进度事件回调（tauri-plugin-updater 的 DownloadEvent，serde tag=event/content=data）：
 * {event:'Started',data:{contentLength}} / {event:'Progress',data:{chunkLength}} / {event:'Finished'}。
 * 注意：Rust 枚举 tag 实为 PascalCase（变体名未做 enum 级重命名），官方 TS 类型却写小写，
 * 这里统一小写比较以兼容两种形状。
 * @param {{event?: string, data?: {contentLength?: number, chunkLength?: number}}} message
 */
function onDownloadEvent(message) {
  const ev = typeof message?.event === 'string' ? message.event.toLowerCase() : '';
  const data = message?.data || {};
  if (ev === 'started') {
    updateState.total = data.contentLength || 0;
  } else if (ev === 'progress') {
    updateState.downloaded += data.chunkLength || 0;
  } else if (ev === 'finished') {
    updateState.status = 'installing';
  }
  renderUpdateUI();
}

/**
 * 下载并安装当前可用更新。仅在 update-available 且有 Update 实例时执行；
 * 带 5 分钟总超时，失败时置 downloadFailed 标记并回退到可重试的 update-available 态。
 */
async function handleDownloadAndInstall() {
  if (updateState.status !== 'update-available' || !updateState.update) return;
  updateState.status = 'downloading';
  updateState.downloaded = 0;
  updateState.total = 0;
  updateState.downloadFailed = false;
  renderUpdateUI();
  try {
    // 总请求超时（ms），按最大安装包尺寸预留，避免慢网下卡死在 downloading
    await updateState.update.downloadAndInstall(onDownloadEvent, { timeout: 300000 });
  } catch (err) {
    console.error('Update download/install failed:', err);
    updateState.status = 'update-available';
    updateState.downloadFailed = true;
    renderUpdateUI();
  }
}

/**
 * 按 updateState.status 渲染设置页状态文字、检查按钮文案/可用态，
 * 以及标题栏更新提示按钮与 GitHub 兜底链接的显隐。
 */
function renderUpdateUI() {
  const s = updateState.status;
  if (updateStatusText) {
    if (s === 'checking') updateStatusText.textContent = '正在检查更新…';
    else if (s === 'up-to-date') updateStatusText.textContent = `当前已是最新版本 (v${APP_VERSION})`;
    else if (s === 'update-available') updateStatusText.textContent = updateState.downloadFailed
      ? '更新下载失败，请重试'
      : `发现新版本 v${updateState.latestVersion}！`;
    else if (s === 'downloading') {
      const pct = updateState.total > 0 ? Math.floor((updateState.downloaded / updateState.total) * 100) : null;
      updateStatusText.textContent = pct !== null ? `下载中 ${pct}%…` : '下载中…';
    } else if (s === 'installing') updateStatusText.textContent = '准备安装，应用即将重启…';
    else if (s === 'error') updateStatusText.textContent = '检查失败，请检查网络';
    else updateStatusText.textContent = `当前版本 v${APP_VERSION}`;
  }
  if (btnCheckUpdate) {
    btnCheckUpdate.classList.toggle('btn-has-update', s === 'update-available');
    if (s === 'checking') {
      btnCheckUpdate.textContent = '检查中...';
      btnCheckUpdate.disabled = true;
    } else if (s === 'up-to-date') {
      btnCheckUpdate.textContent = '已是最新';
      btnCheckUpdate.disabled = false;
      setTimeout(() => {
        if (updateState.status === 'up-to-date') btnCheckUpdate.textContent = '检查更新';
      }, 2500);
    } else if (s === 'update-available') {
      btnCheckUpdate.textContent = '下载并更新';
      btnCheckUpdate.disabled = false;
    } else if (s === 'downloading' || s === 'installing') {
      btnCheckUpdate.textContent = s === 'downloading' ? '下载中…' : '安装中…';
      btnCheckUpdate.disabled = true;
    } else if (s === 'error') {
      btnCheckUpdate.textContent = '重试';
      btnCheckUpdate.disabled = false;
    } else {
      btnCheckUpdate.textContent = '检查更新';
      btnCheckUpdate.disabled = false;
    }
  }
  if (linkGithubRelease) linkGithubRelease.classList.toggle('hidden', s !== 'update-available');
  if (btnUpdateHint) btnUpdateHint.classList.toggle('hidden', s !== 'update-available');
}

/** 排程每日自动检查：到点静默检查一次，然后递归重新排程（应用不关则每天至少查一次）。 */
function scheduleDailyCheck() {
  setTimeout(() => {
    runUpdateCheck(true);
    scheduleDailyCheck();
  }, UPDATE_CHECK_INTERVAL_MS);
}

/**
 * 初始化更新检查器：读取真实应用版本（失败则保留兜底版本号），
 * 渲染初始 UI，触发一次静默检查，并启动每日检查排程。
 */
async function initUpdateChecker() {
  try {
    // 全局 API 的 getVersion 实际 invoke `plugin:app|version`；
    // `core:app:version` 不是有效命令名，会 reject 并被空 catch 吞掉
    const getVersion = window.__TAURI__?.app?.getVersion;
    const v = getVersion ? await getVersion() : null;
    if (typeof v === 'string' && v) APP_VERSION = v;
  } catch (e) {
    // 保留兜底版本号
  }
  if (appVersionFooter) appVersionFooter.textContent = `Sticky Todo v${APP_VERSION} · Tauri 2`;
  renderUpdateUI();
  runUpdateCheck(true);
  scheduleDailyCheck();
}

// Pull the persisted dock/collapse state so the edge strip renders
// correctly after a relaunch (events emitted during setup are lost before
// this script runs).
async function restoreDockState() {
  try {
    const { docked, edge, collapsed } = await invoke('get_dock_state');
    document.body.classList.remove('docked', 'dock-left', 'dock-right', 'dock-top', 'collapsed');
    if (docked) {
      document.body.classList.add('docked', `dock-${edge}`);
    }
    if (collapsed) {
      document.body.classList.add('collapsed');
    }
  } catch (err) {
    console.error('Failed to restore dock state:', err);
  }
}

function setupDockListeners() {
  const listen = window.__TAURI__?.event?.listen;
  if (listen) {
    listen('dock-changed', (event) => {
      const { docked, edge } = event.payload;
      document.body.classList.remove('docked', 'dock-left', 'dock-right', 'dock-top', 'collapsed');
      if (docked) {
        document.body.classList.add('docked', `dock-${edge}`);
      }
    });

    listen('collapsed-changed', (event) => {
      if (event.payload) {
        document.body.classList.add('collapsed');
      } else {
        document.body.classList.remove('collapsed');
      }
    });
  }

  // Click or hover on collapsed strip to expand immediately
  const edgePeek = document.getElementById('edge-peek');
  if (edgePeek) {
    edgePeek.addEventListener('mouseenter', () => {
      if (document.body.classList.contains('collapsed')) {
        document.body.classList.remove('collapsed');
        invoke('expand_window');
      }
    });
    edgePeek.addEventListener('click', () => {
      document.body.classList.remove('collapsed');
      invoke('expand_window');
    });
  }

  document.addEventListener('click', () => {
    if (document.body.classList.contains('collapsed')) {
      invoke('expand_window');
    }
  });
}

// ── Todo Operations ─────────────────────────────────

const INPUT_MAX_HEIGHT = 90;
/**
 * 自适应输入框高度：随内容行数增长，上限 INPUT_MAX_HEIGHT（超出滚动）。
 * @param {HTMLTextAreaElement} el 目标 textarea
 */
function autoResize(el) {
  el.style.height = 'auto';
  const cs = getComputedStyle(el);
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  el.style.height = Math.min(el.scrollHeight + border, INPUT_MAX_HEIGHT) + 'px';
}

/**
 * 提交添加框内容：调用 add_todo 创建待办，清空输入框并回落高度。
 */
async function addTodo() {
  const text = todoInput.value.trim();
  if (!text) {
    todoInput.focus();
    return;
  }

  todos = (await invoke('add_todo', { text })) || [];
  todoInput.value = '';
  autoResize(todoInput);
  todoInput.focus();
  render();

  requestAnimationFrame(() => {
    todoList.scrollTop = todoList.scrollHeight;
  });
}

async function toggleTodo(id) {
  todos = (await invoke('toggle_todo', { id })) || [];
  render();
}

async function deleteTodo(id) {
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.add('removing');
    await new Promise(resolve => setTimeout(resolve, 180));
  }

  todos = (await invoke('delete_todo', { id })) || [];
  render();
}

/**
 * 将指定待办切换为内联编辑：textarea 按内容撑高，Enter 保存、Shift+Enter 换行、Esc 取消。
 * @param {string} id 待办 ID
 */
async function editTodo(id) {
  const item = todos.find(t => t.id === id);
  if (!item) return;

  const el = document.querySelector(`[data-id="${id}"]`);
  const textSpan = el.querySelector('.todo-text');

  const input = document.createElement('textarea');
  input.rows = 1;
  input.spellcheck = false;
  input.className = 'todo-edit-input';
  input.value = item.text;
  textSpan.replaceWith(input);
  autoResize(input);
  input.focus();
  input.select();

  const finish = async () => {
    const newText = input.value.trim();
    if (newText && newText !== item.text) {
      todos = (await invoke('edit_todo', { id, text: newText })) || [];
    }
    render();
  };

  input.addEventListener('blur', finish);
  input.addEventListener('input', () => autoResize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      input.blur();
    }
    if (e.key === 'Escape') {
      input.value = item.text;
      input.blur();
    }
  });
}

async function clearCompleted() {
  const doneTodos = todos.filter(t => t.done);
  for (const t of doneTodos) {
    await invoke('delete_todo', { id: t.id });
  }
  todos = (await invoke('get_todos')) || [];
  render();
}

// ── Drag & Drop Reorder ─────────────────────────────

function handleDragStart(e, id) {
  dragSrcId = id;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  dragSrcId = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const li = e.target.closest('.todo-item');
  if (li && li.dataset.id !== dragSrcId) {
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    li.classList.add('drag-over');
  }
}

async function handleDrop(e, targetId) {
  e.preventDefault();
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

  if (!dragSrcId || dragSrcId === targetId) return;

  const ids = todos.map(t => t.id);
  const srcIdx = ids.indexOf(dragSrcId);
  const dstIdx = ids.indexOf(targetId);

  if (srcIdx === -1 || dstIdx === -1) return;

  ids.splice(srcIdx, 1);
  ids.splice(dstIdx, 0, dragSrcId);

  todos = (await invoke('reorder_todos', { ids })) || [];
  render();
}

// ── Render ──────────────────────────────────────────

function render() {
  const pending = todos.filter(t => !t.done).length;
  const done = todos.filter(t => t.done).length;

  if (todos.length === 0) {
    statsText.textContent = '0 项待办';
  } else {
    statsText.textContent = `${pending} 项待办${done > 0 ? ` · ${done} 已完成` : ''}`;
  }

  btnClearDone.style.display = done > 0 ? 'inline-block' : 'none';

  if (todos.length === 0) {
    emptyState.classList.remove('hidden');
    todoList.style.display = 'none';
  } else {
    emptyState.classList.add('hidden');
    todoList.style.display = '';
  }

  const sorted = [
    ...todos.filter(t => !t.done),
    ...todos.filter(t => t.done),
  ];

  todoList.innerHTML = sorted.map(item => `
    <li class="todo-item ${item.done ? 'done' : ''}"
        data-id="${item.id}"
        draggable="true">
      <div class="todo-checkbox" onclick="toggleTodo('${item.id}')">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <polyline points="2,6 5,9 10,3" stroke="white" stroke-width="1.8"
                    stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="todo-text" ondblclick="editTodo('${item.id}')">${escapeHtml(item.text)}</span>
      <button class="todo-edit" onclick="editTodo('${item.id}')" title="编辑">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
      </button>
      <button class="todo-delete" onclick="deleteTodo('${item.id}')" title="删除">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </li>
  `).join('');

  todoList.querySelectorAll('.todo-item').forEach(li => {
    const id = li.dataset.id;
    li.addEventListener('dragstart', (e) => handleDragStart(e, id));
    li.addEventListener('dragend', handleDragEnd);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('drop', (e) => handleDrop(e, id));
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Start ───────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
