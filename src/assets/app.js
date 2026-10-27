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
  render();
  setupEventListeners();
  setupDockListeners();
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

  // Clear completed
  btnClearDone.addEventListener('click', clearCompleted);
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
        invoke('expand_window');
      }
    });
    edgePeek.addEventListener('click', () => {
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
