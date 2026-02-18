/* ═══════════════════════════════════════════
   Auryn Tasks — Frontend App
═══════════════════════════════════════════ */

const API = '/api/tasks';

let allTasks      = [];
let priorityFilter = 'all';
let statusFilter   = 'active';
let currentView    = 'tasks';

// Calendar state — init from JST
const _jstNow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(new Date()).split('-');
let calYear  = parseInt(_jstNow[0]);
let calMonth = parseInt(_jstNow[1]); // 1–12
let calData  = { tasks: [], events: [] };

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
    if (e.key === 'Escape') { closeModal(); hidePopover(); }
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

  // View toggle
  document.querySelector('.view-toggle').addEventListener('click', e => {
    const pill = e.target.closest('.view-pill');
    if (!pill) return;
    const view = pill.dataset.view;
    switchView(view);
  });

  // Calendar navigation
  document.getElementById('calPrev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 1) { calMonth = 12; calYear--; }
    loadCalendar();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    loadCalendar();
  });

  // Calendar grid click (event delegation)
  document.getElementById('calGrid').addEventListener('click', e => {
    const cell = e.target.closest('.cal-day:not(.empty)');
    if (!cell) return;
    const dateStr = cell.dataset.date;
    if (!dateStr) return;

    // Build items list from calData for this date
    const tasks  = (calData.tasks  || []).filter(t => t.due_date === dateStr).map(t => ({ ...t, _type: 'task'  }));
    const events = (calData.events || []).filter(ev => ev.date === dateStr).map(ev => ({ ...ev, _type: 'event' }));
    handleDayClick(dateStr, [...tasks, ...events]);
    e.stopPropagation();
  });

  // Popover close button & backdrop
  document.getElementById('calPopoverClose').addEventListener('click', hidePopover);
  document.getElementById('calPopover').addEventListener('click', e => e.stopPropagation());
}

// ─── View Switching ─────────────────────────
function switchView(view) {
  currentView = view;

  document.querySelectorAll('.view-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.view === view);
  });

  const taskView = document.getElementById('taskView');
  const calView  = document.getElementById('calendarView');
  const addBtn   = document.getElementById('addTaskBtn');

  if (view === 'calendar') {
    taskView.style.display = 'none';
    calView.style.display  = 'block';
    addBtn.style.display   = 'none';
    loadCalendar();
  } else {
    taskView.style.display = 'block';
    calView.style.display  = 'none';
    addBtn.style.display   = '';
  }
}

// ─── Service Worker ─────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  }
}

// ─── Date Helpers ───────────────────────────
// Always use JST (Asia/Tokyo) for date comparisons — Eric is in Japan
const JST = 'Asia/Tokyo';

function jstDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: JST }).format(date);
}

function getToday()   { return jstDateStr(new Date()); }

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return jstDateStr(d);
}

function getWeekEnd() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return jstDateStr(d);
}

/**
 * Classify a due date relative to today.
 * Returns: 'overdue' | 'today' | 'tomorrow' | 'week' | 'future' | null
 */
function classifyDueDate(dueDate, completed) {
  if (completed || !dueDate) return null;
  const today    = getToday();
  const tomorrow = getTomorrow();
  const weekEnd  = getWeekEnd();
  if (dueDate < today)    return 'overdue';
  if (dueDate === today)  return 'today';
  if (dueDate === tomorrow) return 'tomorrow';
  if (dueDate <= weekEnd) return 'week';
  return 'future';
}

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

// ─── API Calls ──────────────────────────────
async function loadTasks() {
  try {
    const res  = await fetch(API);
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

// ─── Render Tasks ───────────────────────────
function renderTasks() {
  const container = document.getElementById('taskList');

  let filtered = allTasks.filter(task => {
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    if (statusFilter === 'active'    && task.completed) return false;
    if (statusFilter === 'completed' && !task.completed) return false;
    return true;
  });

  // Sort: overdue first, then today, then priority, then due date
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const dueOrder = { overdue: 0, today: 1, tomorrow: 2, week: 3, future: 4, null: 5 };
  filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const da = classifyDueDate(a.due_date, a.completed);
    const db = classifyDueDate(b.due_date, b.completed);
    const dueA = dueOrder[da] ?? 5;
    const dueB = dueOrder[db] ?? 5;
    if (dueA !== dueB) return dueA - dueB;
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
    const dueCls = classifyDueDate(task.due_date, task.completed);

    // Card classes
    const cardClasses = [
      'task-card',
      `priority-${task.priority}`,
      task.completed ? 'completed' : '',
      dueCls && !task.completed ? `due-${dueCls}` : ''
    ].filter(Boolean).join(' ');

    // Due-status badge (shown under title for active tasks)
    let dueBadgeHtml = '';
    if (!task.completed) {
      if (dueCls === 'overdue')   dueBadgeHtml = `<span class="due-badge overdue">⚠️ OVERDUE</span>`;
      else if (dueCls === 'today')  dueBadgeHtml = `<span class="due-badge today">🔥 DUE TODAY</span>`;
      else if (dueCls === 'tomorrow') dueBadgeHtml = `<span class="due-badge tomorrow">📅 Tomorrow</span>`;
    }

    // Date label in meta row
    let dateLabel = '';
    let dateClass = '';
    if (task.completed && task.completed_date) {
      dateLabel = `✔ Done ${fmt(task.completed_date)}`;
      dateClass = 'done';
    } else if (task.due_date) {
      if (dueCls === 'overdue')   { dateLabel = `⚠️ Overdue: ${fmt(task.due_date)}`; dateClass = 'overdue'; }
      else if (dueCls === 'today')  { dateLabel = `📅 Due today`; dateClass = 'today'; }
      else                          { dateLabel = `📅 ${fmt(task.due_date)}`; }
    }

    return `
    <div class="${cardClasses}" data-id="${task.id}">
      <div class="task-header">
        <div class="task-title">${escapeHtml(task.title)}</div>
      </div>
      ${dueBadgeHtml}
      <div class="task-meta" style="margin-top:6px">
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

// ─── Update Stats ───────────────────────────
function updateStats() {
  const today    = getToday();
  const active   = allTasks.filter(t => !t.completed);
  const done     = allTasks.filter(t => t.completed);
  const overdue  = active.filter(t => t.due_date && t.due_date < today);
  const dueToday = active.filter(t => t.due_date === today);

  document.getElementById('statTotal').textContent  = allTasks.length;
  document.getElementById('statActive').textContent = active.length;
  document.getElementById('statDone').textContent   = done.length;

  const overdueEl = document.getElementById('statOverdue');
  overdueEl.textContent = overdue.length;
  overdueEl.className = 'stat-num' + (overdue.length > 0 ? ' overdue-color' : '');

  const todayEl = document.getElementById('statToday');
  todayEl.textContent = dueToday.length;
  todayEl.className = 'stat-num' + (dueToday.length > 0 ? ' today-color' : '');

  // Due alert bar
  const alertEl = document.getElementById('dueAlert');
  if (overdue.length > 0 || dueToday.length > 0) {
    const parts = [];
    if (overdue.length > 0)  parts.push(`<span class="alert-overdue">⚠️ ${overdue.length} overdue</span>`);
    if (dueToday.length > 0) parts.push(`<span class="alert-today">🔥 ${dueToday.length} due today</span>`);
    alertEl.innerHTML = parts.join('<span class="alert-sep"> | </span>');
    alertEl.style.display = 'flex';
  } else {
    alertEl.style.display = 'none';
  }
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

// ═══════════════════════════════════════════
//   Calendar
// ═══════════════════════════════════════════

async function loadCalendar() {
  document.getElementById('calTitle').textContent = 'Loading…';
  document.getElementById('calGrid').innerHTML = '';

  try {
    const res  = await fetch(`/api/calendar?year=${calYear}&month=${calMonth}`);
    calData = await res.json();
  } catch (err) {
    console.error('Calendar load error:', err);
    calData = { tasks: [], events: [] };
    showToast('⚠️ Calendar load failed');
  }

  renderCalendar();
}

function renderCalendar() {
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  document.getElementById('calTitle').textContent = `${MONTHS[calMonth - 1]} ${calYear}`;

  const grid = document.getElementById('calGrid');
  const today = getToday();

  // Build lookup maps: date -> items
  const tasksByDate  = {};
  const eventsByDate = {};

  (calData.tasks || []).forEach(t => {
    if (!t.due_date) return;
    if (!tasksByDate[t.due_date]) tasksByDate[t.due_date] = [];
    tasksByDate[t.due_date].push(t);
  });

  (calData.events || []).forEach(ev => {
    if (!ev.date) return;
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    eventsByDate[ev.date].push(ev);
  });

  const firstDayOfMonth = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth     = new Date(calYear, calMonth, 0).getDate();

  let html = '';

  // Day-of-week headers
  DAYS.forEach(d => { html += `<div class="cal-day-header">${d}</div>`; });

  // Empty cells before the 1st
  for (let i = 0; i < firstDayOfMonth; i++) {
    html += `<div class="cal-day empty"></div>`;
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr  = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday  = dateStr === today;
    const tasks    = tasksByDate[dateStr]  || [];
    const events   = eventsByDate[dateStr] || [];
    const allItems = [...tasks.map(t => ({ ...t, _type: 'task' })),
                      ...events.map(e => ({ ...e, _type: 'event' }))];

    const MAX_CHIPS = 3;
    const shown     = allItems.slice(0, MAX_CHIPS);
    const extra     = allItems.length - MAX_CHIPS;

    let chipsHtml = shown.map(item => {
      if (item._type === 'task') {
        const cls = item.due_date < today ? 'task-overdue' :
                    item.due_date === today ? 'task-today' : 'task-upcoming';
        return `<div class="cal-chip ${cls}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>`;
      } else {
        const timeStr = item.time ? ` ${item.time}` : '';
        return `<div class="cal-chip gcal-event" title="${escapeHtml(item.title)}">${timeStr}${escapeHtml(item.title)}</div>`;
      }
    }).join('');

    if (extra > 0) {
      chipsHtml += `<div class="cal-chip more">+${extra} more</div>`;
    }

    const cls = ['cal-day', isToday ? 'today' : ''].filter(Boolean).join(' ');
    html += `
      <div class="${cls}" data-date="${dateStr}">
        <span class="cal-day-num">${day}</span>
        <div class="cal-chips">${chipsHtml}</div>
      </div>`;
  }

  grid.innerHTML = html;
}

// ─── Calendar Day Click / Popover ───────────
function handleDayClick(dateStr, items) {
  const popover     = document.getElementById('calPopover');
  const dateEl      = document.getElementById('calPopoverDate');
  const bodyEl      = document.getElementById('calPopoverBody');

  // Format date nicely
  const [y, m, d] = dateStr.split('-');
  const dateObj    = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const opts       = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  dateEl.textContent = dateObj.toLocaleDateString('en-US', opts);

  if (items.length === 0) {
    bodyEl.innerHTML = `<div class="cal-popover-empty">Nothing scheduled</div>`;
  } else {
    bodyEl.innerHTML = items.map(item => {
      if (item._type === 'task') {
        const icon = item.due_date < getToday() ? '⚠️' : item.due_date === getToday() ? '🔥' : '📋';
        return `<div class="cal-popover-item">
          <span class="item-icon">${icon}</span>
          <span class="item-text">${escapeHtml(item.title)}
            <span class="item-time">${item.priority} priority · ${escapeHtml(item.category)}</span>
          </span>
        </div>`;
      } else {
        const timeStr = item.time ? item.time : 'All day';
        return `<div class="cal-popover-item">
          <span class="item-icon">🗓️</span>
          <span class="item-text">${escapeHtml(item.title || '(No title)')}
            <span class="item-time">${timeStr}</span>
          </span>
        </div>`;
      }
    }).join('');
  }

  popover.classList.add('show');

  // Close on next outside click
  setTimeout(() => {
    document.addEventListener('click', hidePopover, { once: true });
  }, 0);
}

function hidePopover() {
  document.getElementById('calPopover').classList.remove('show');
}
