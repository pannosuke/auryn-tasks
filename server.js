const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9092;
const TASKS_FILE = path.join(__dirname, 'tasks.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: read tasks
function readTasks() {
  const raw = fs.readFileSync(TASKS_FILE, 'utf8');
  return JSON.parse(raw);
}

// Helper: write tasks
function writeTasks(data) {
  data.last_updated = new Date().toISOString();
  data.updated_by = 'auryn-tasks';
  fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/tasks
app.get('/api/tasks', (req, res) => {
  try {
    const data = readTasks();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read tasks', details: err.message });
  }
});

// POST /api/tasks
app.post('/api/tasks', (req, res) => {
  try {
    const { title, priority, category, due_date } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const data = readTasks();
    const newTask = {
      id: `task_${Date.now()}`,
      title,
      priority: priority || 'medium',
      category: category || 'Admin',
      due_date: due_date || null,
      created: new Date().toISOString().split('T')[0],
      completed: false,
      completed_date: null
    };
    data.tasks.push(newTask);
    writeTasks(data);
    res.status(201).json(newTask);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task', details: err.message });
  }
});

// PATCH /api/tasks/:id
app.patch('/api/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = readTasks();
    const task = data.tasks.find(t => t.id === id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const allowedFields = ['title', 'priority', 'category', 'due_date', 'completed', 'completed_date'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        task[field] = req.body[field];
      }
    }

    // Auto-set completed_date when completing
    if (req.body.completed === true && !task.completed_date) {
      task.completed_date = new Date().toISOString().split('T')[0];
    }
    if (req.body.completed === false) {
      task.completed_date = null;
    }

    writeTasks(data);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task', details: err.message });
  }
});

// DELETE /api/tasks/:id
app.delete('/api/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = readTasks();
    const idx = data.tasks.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    data.tasks.splice(idx, 1);
    writeTasks(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task', details: err.message });
  }
});

// GET /api/calendar
app.get('/api/calendar', async (req, res) => {
  const year  = parseInt(req.query.year)  || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;

  // Get tasks with due dates (incomplete only)
  const taskData = readTasks();
  const tasks = taskData.tasks.filter(t => t.due_date && !t.completed);

  // Fetch Google Family Calendar events via Maton
  const calId  = '01397450559fe52c9b3eb22b2b52c961f1f53a2e8b0fac36a8420f57bdf177e0@group.calendar.google.com';
  const apiKey = process.env.MATON_API_KEY;

  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate   = new Date(year, month, 0, 23, 59, 59).toISOString();

  let events = [];
  try {
    const url = `https://gateway.maton.ai/google-calendar/calendar/v3/calendars/${encodeURIComponent(calId)}/events?timeMin=${startDate}&timeMax=${endDate}&singleEvents=true&orderBy=startTime`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const calData = await response.json();
    events = (calData.items || []).map(e => ({
      id:    e.id,
      title: e.summary,
      date:  e.start.date || e.start.dateTime?.split('T')[0],
      time:  e.start.dateTime ? e.start.dateTime.split('T')[1]?.substring(0, 5) : null,
      type:  'calendar'
    }));
  } catch (e) {
    console.error('Calendar fetch error:', e.message);
  }

  res.json({ tasks, events });
});

// Catch-all: serve index.html for SPA (Express 5 wildcard syntax)
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Auryn Tasks running on http://localhost:${PORT}`);
});
