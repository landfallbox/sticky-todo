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
const themeSegmented = document.getElementById('theme-segmented');

const THEME_KEY = 'sticky-todo:theme';
const THEME_MODES = ['light', 'dark', 'system'];
let systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

let todos = [];
let dragSrcId = null;
let latestReleaseUrl = null;

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

function setupEventListeners() {
  // Add todo
  btnAdd.addEventListener('click', addTodo);
  todoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTodo();
  });

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
    btnCheckUpdate.addEventListener('click', handleCheckUpdate);
  }

  // Clear completed
  btnClearDone.addEventListener('click', clearCompleted);
}

// ── Update Checker ──────────────────────────────────

function compareSemver(a, b) {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

async function handleCheckUpdate() {
  if (latestReleaseUrl) {
    try {
      await invoke('open_external_url', { url: latestReleaseUrl });
    } catch {
      window.open(latestReleaseUrl, '_blank');
    }
    return;
  }

  btnCheckUpdate.disabled = true;
  btnCheckUpdate.textContent = '检查中...';
  if (updateStatusText) updateStatusText.textContent = '正在获取最新版本信息...';

  try {
    let result = null;
    try {
      result = await invoke('check_for_updates');
    } catch (e) {
      console.warn('Backend update check failed:', e);
    }

    // Fallback: try frontend web fetch if backend failed
    if (!result || !result.success) {
      try {
        const resp = await fetch('https://api.github.com/repos/landfallbox/sticky-todo/releases/latest');
        if (resp.ok) {
          const data = await resp.json();
          const latestTag = data.tag_name || '';
          const latestVer = latestTag.replace(/^v/, '');
          const curVer = '0.1.2';
          const hasUp = compareSemver(latestVer, curVer) > 0;
          result = {
            success: true,
            has_update: hasUp,
            latest_version: latestVer,
            release_url: data.html_url,
            current_version: curVer
          };
        }
      } catch (e) {
        console.warn('Frontend fallback fetch failed:', e);
      }
    }

    if (result && result.success) {
      if (result.has_update) {
        latestReleaseUrl = result.release_url || 'https://github.com/landfallbox/sticky-todo/releases';
        if (updateStatusText) updateStatusText.textContent = `发现新版本 v${result.latest_version}！`;
        btnCheckUpdate.textContent = '前往下载';
        btnCheckUpdate.classList.add('btn-has-update');
        btnCheckUpdate.disabled = false;
      } else {
        if (updateStatusText) updateStatusText.textContent = `当前已是最新版本 (v${result.current_version})`;
        btnCheckUpdate.textContent = '已是最新';
        setTimeout(() => {
          btnCheckUpdate.textContent = '检查更新';
          btnCheckUpdate.disabled = false;
        }, 2500);
      }
    } else {
      if (updateStatusText) updateStatusText.textContent = '检查失败，请检查网络';
      btnCheckUpdate.textContent = '重试';
      btnCheckUpdate.disabled = false;
    }
  } catch (err) {
    console.error('Update check error:', err);
    if (updateStatusText) updateStatusText.textContent = '检查失败，请稍后重试';
    btnCheckUpdate.textContent = '重试';
    btnCheckUpdate.disabled = false;
  }
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

async function addTodo() {
  const text = todoInput.value.trim();
  if (!text) {
    todoInput.focus();
    return;
  }

  todos = (await invoke('add_todo', { text })) || [];
  todoInput.value = '';
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

async function editTodo(id) {
  const item = todos.find(t => t.id === id);
  if (!item) return;

  const el = document.querySelector(`[data-id="${id}"]`);
  const textSpan = el.querySelector('.todo-text');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-edit-input';
  input.value = item.text;
  textSpan.replaceWith(input);
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
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
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
