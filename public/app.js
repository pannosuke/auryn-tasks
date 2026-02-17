/* ═══════════════════════════════════════════
   Auryn Tasks — Frontend App
═══════════════════════════════════════════ */

const API = '/api/tasks';

let allTasks = [];
let priorityFilter = 'all';
let statusFilter = 'active';

// ─── Init ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTasks();
  bindEvents();
  registerSW();
});

function bindEvents() {
  document.getElementById('addTaskBtn').addEventListener('click', openModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('taskForm').addEventListener('submit', handleAddTask);

  // Close modal on overlay click
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Close modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Priority filter pills
  document.getElementById('priorityFilters').addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#priorityFilters .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    priorityFilter = pill.dataset.priority;
    renderTasks();
  });

  // Status filter pills
  document.getElementById('statusFilters').addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#statusFilters .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    statusFilter = pill.dataset.status;
    renderTasks();
  });
}

// ─── Service Worker ─────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  }
}

// ─── API Calls ──────────────────────────────
async function loadTasks() {
  try {
    const res = await fetch(API);
    const data = await res.json();
    allTasks = data.tasks || [];
    renderTasks();
    updateStats();
  } catch (err) {
    showToast('⚠️ Failed to load tasks');
    console.error(err);
  }
}

async function handleAddTask(e) {
  e.preventDefault();
  const title    = document.getElementById('taskTitle').value.trim();
  const priority = document.getElementById('taskPriority').value;
  const category = document.getElementById('taskCategory').value;
  const due_date = document.getElementById('taskDueDate').value || null;

  if (!title) return;

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, priority, category, due_date })
    });
    const task = await res.json();
    allTasks.push(task);
    closeModal();
    renderTasks();
    updateStats();
    showToast('✅ Task added');
  } catch (err) {
    showToast('⚠️ Failed to add task');
    console.error(err);
  }
}

async function completeTask(id) {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;
  const newState = !task.completed;

  try {
    const res = await fetch(`${API}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: newState })
    });
    const updated = await res.json();
    const idx = allTasks.findIndex(t => t.id === id);
    allTasks[idx] = updated;
    renderTasks();
    updateStats();
    showToast(newState ? '✅ Marked complete' : '↩️ Marked active');
  } catch (err) {
    showToast('⚠️ Failed to update task');
  }
}

async function deleteTask(id) {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;
  const ok = confirm(`Delete "${task.title}"?`);
  if (!ok) return;

  try {
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    allTasks = allTasks.filter(t => t.id !== id);
    renderTasks();
    updateStats();
    showToast('🗑️ Task deleted');
  } catch (err) {
    showToast('⚠️ Failed to delete task');
  }
}

// ─── Render ─────────────────────────────────
function renderTasks() {
  const container = document.getElementById('taskList');
  const today = new Date().toISOString().split('T')[0];

  let filtered = allTasks.filter(task => {
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    if (statusFilter === 'active'    && task.completed) return false;
    if (statusFilter === 'completed' && !task.completed) return false;
    return true;
  });

  // Sort: incomplete first, then by priority, then by due date
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.priority !== b.priority) return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return 0;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🦉</div>
        <p>${statusFilter === 'completed' ? 'No completed tasks yet.' : 'No tasks here! Click "+ Add Task" to get started.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(task => {
    const isOverdue = !task.completed && task.due_date && task.due_date < today;
    const isToday   = !task.completed && task.due_date === today;

    let dateLabel = '';
    let dateClass = '';
    if (task.completed && task.completed_date) {
      dateLabel = `✔ Done ${fmt(task.completed_date)}`;
      dateClass = 'done';
    } else if (task.due_date) {
      if (isOverdue) {
        dateLabel = `⚠️ Overdue: ${fmt(task.due_date)}`;
        dateClass = 'overdue';
      } else if (isToday) {
        dateLabel = `📅 Due today`;
        dateClass = 'today';
      } else {
        dateLabel = `📅 ${fmt(task.due_date)}`;
      }
    }

    const cardClass = [
      'task-card',
      `priority-${task.priority}`,
      task.completed ? 'completed' : '',
      isOverdue ? 'overdue' : '',
      isToday ? 'due-today' : ''
    ].filter(Boolean).join(' ');

    return `
    <div class="${cardClass}" data-id="${task.id}">
      <div class="task-header">
        <div class="task-title">${escapeHtml(task.title)}</div>
      </div>
      <div class="task-meta">
        <span class="badge badge-${task.priority}">${task.priority}</span>
        <span class="badge-cat">${escapeHtml(task.category)}</span>
        ${dateLabel ? `<span class="task-date ${dateClass}">${dateLabel}</span>` : ''}
      </div>
      <div class="task-actions">
        <button class="btn btn-sm btn-ghost" onclick="completeTask('${task.id}')">
          ${task.completed ? '↩️ Reopen' : '✅ Complete'}
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteTask('${task.id}')">
          🗑️ Delete
        </button>
      </div>
    </div>`;
  }).join('');
}

function updateStats() {
  const today = new Date().toISOString().split('T')[0];
  const active  = allTasks.filter(t => !t.completed);
  const done    = allTasks.filter(t => t.completed);
  const overdue = active.filter(t => t.due_date && t.due_date < today);

  document.getElementById('statTotal').textContent   = allTasks.length;
  document.getElementById('statActive').textContent  = active.length;
  document.getElementById('statOverdue').textContent = overdue.length;
  document.getElementById('statDone').textContent    = done.length;
}

// ─── Modal ──────────────────────────────────
function openModal() {
  document.getElementById('taskForm').reset();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('taskTitle').focus(), 100);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ─── Toast ──────────────────────────────────
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─── Helpers ─────────────────────────────────
function fmt(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
