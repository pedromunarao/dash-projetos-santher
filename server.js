/**
 * server.js – API REST do Priority Manager
 * Express + SQLite via sql.js (puro JS, sem compilação nativa)
 *
 * Para iniciar: node server.js
 * Acesse em:    http://localhost:3000
 */

const express = require('express');
const path    = require('path');
const db      = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* ============================================================
   HELPERS
============================================================ */

function rowToTask(row) {
  if (!row) return null;
  return {
    id:          row.id,
    title:       row.title,
    description: row.description || '',
    priority:    row.priority,
    status:      row.status,
    area:        row.area || '',
    solicitor:   row.solicitor || '',
    resources:   JSON.parse(row.resources || '[]'),
    openedAt:    row.opened_at,
    dueDate:     row.due_date || '',
    closedAt:    row.closed_at || '',
    notes:       row.notes || '',
    history:     JSON.parse(row.history || '[]'),
  };
}

function getStatusLabel(key) {
  const row = db.get(`SELECT label FROM statuses WHERE key = ?`, [key]);
  return row?.label || key;
}

/* ============================================================
   BOOTSTRAP
============================================================ */
app.get('/api/bootstrap', (req, res) => {
  const tasks     = db.all(`SELECT * FROM tasks ORDER BY priority ASC`).map(rowToTask);
  const resources = db.all(`SELECT * FROM resources ORDER BY name ASC`);
  const types     = db.all(`SELECT name FROM resource_types ORDER BY name ASC`).map(r => r.name);
  const statuses  = db.all(`SELECT * FROM statuses ORDER BY position ASC`);
  const areas     = db.all(`SELECT name FROM areas ORDER BY name ASC`).map(r => r.name);
  const prefRows  = db.all(`SELECT key, value FROM preferences`);
  const prefs     = prefRows.reduce((acc, p) => { acc[p.key] = p.value; return acc; }, {});

  res.json({ tasks, resources, resourceTypes: types, statuses, areas, prefs });
});

/* ============================================================
   ÁREAS SOLICITANTES
============================================================ */
app.get('/api/areas', (req, res) => {
  res.json(db.all(`SELECT name FROM areas ORDER BY name ASC`).map(r => r.name));
});

app.post('/api/areas', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome obrigatório.' });
  const upper = name.trim().toUpperCase();
  db.run(`INSERT OR IGNORE INTO areas (name) VALUES (?)`, [upper]);
  res.status(201).json({ name: upper });
});

app.delete('/api/areas/:name', (req, res) => {
  const info = db.run(`DELETE FROM areas WHERE name = ?`, [req.params.name]);
  if (info.changes === 0) return res.status(404).json({ error: 'Área não encontrada.' });
  res.json({ ok: true });
});

/* ============================================================
   TAREFAS
============================================================ */
app.get('/api/tasks', (req, res) => {
  res.json(db.all(`SELECT * FROM tasks ORDER BY priority ASC`).map(rowToTask));
});

app.post('/api/tasks', (req, res) => {
  const d   = req.body;
  const now = new Date().toISOString();
  const id  = db.getNextTaskId();
  const closedAt = d.status === 'CONCLUIDO' ? now : '';

  db.run(
    `INSERT INTO tasks (id, title, description, priority, status, area, solicitor,
                        resources, opened_at, due_date, closed_at, notes, history)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      d.title || '',
      d.description || '',
      Number(d.priority) || 0,
      d.status || 'PENDENTE',
      d.area || '',
      d.solicitor || '',
      JSON.stringify(d.resources || []),
      now,
      d.dueDate || '',
      closedAt,
      d.notes || '',
      JSON.stringify([{ time: now, text: 'Tarefa criada.' }]),
    ]
  );

  res.status(201).json(rowToTask(db.get(`SELECT * FROM tasks WHERE id = ?`, [id])));
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const old    = db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
  if (!old) return res.status(404).json({ error: 'Tarefa não encontrada.' });

  const d       = req.body;
  const now     = new Date().toISOString();
  const changes = [];

  if (d.title       !== undefined && d.title       !== old.title)       changes.push(`Título: "${old.title}" → "${d.title}"`);
  if (d.status      !== undefined && d.status      !== old.status)      changes.push(`Status: ${getStatusLabel(old.status)} → ${getStatusLabel(d.status)}`);
  if (d.priority    !== undefined && String(d.priority) !== String(old.priority)) changes.push(`Prioridade: ${old.priority} → ${d.priority}`);
  if (d.area        !== undefined && d.area        !== old.area)        changes.push(`Área: ${old.area} → ${d.area}`);
  if (d.solicitor   !== undefined && d.solicitor   !== old.solicitor)   changes.push(`Solicitante: ${old.solicitor} → ${d.solicitor}`);
  if (d.dueDate     !== undefined && d.dueDate     !== old.due_date)    changes.push(`Data prevista: ${old.due_date || '—'} → ${d.dueDate || '—'}`);
  if (d.notes       !== undefined && d.notes       !== old.notes)       changes.push('Observações atualizadas.');
  if (d.description !== undefined && d.description !== old.description) changes.push('Descrição atualizada.');
  if (d.resources   !== undefined) {
    const oldR = JSON.parse(old.resources || '[]').join(', ');
    const newR = (d.resources || []).join(', ');
    if (oldR !== newR) changes.push(`Recursos: [${oldR || '—'}] → [${newR || '—'}]`);
  }

  const history = JSON.parse(old.history || '[]');
  if (changes.length) history.push({ time: now, text: changes.join(' | ') });

  const newStatus   = d.status !== undefined ? d.status : old.status;
  const newClosedAt = (newStatus === 'CONCLUIDO' && old.status !== 'CONCLUIDO') ? now : (old.closed_at || '');

  db.run(
    `UPDATE tasks SET
       title = ?, description = ?, priority = ?, status = ?,
       area = ?, solicitor = ?, resources = ?,
       due_date = ?, closed_at = ?, notes = ?, history = ?
     WHERE id = ?`,
    [
      d.title       !== undefined ? d.title               : old.title,
      d.description !== undefined ? d.description         : old.description,
      d.priority    !== undefined ? Number(d.priority)    : old.priority,
      newStatus,
      d.area        !== undefined ? d.area                : old.area,
      d.solicitor   !== undefined ? d.solicitor           : old.solicitor,
      d.resources   !== undefined ? JSON.stringify(d.resources) : old.resources,
      d.dueDate     !== undefined ? d.dueDate             : old.due_date,
      newClosedAt,
      d.notes       !== undefined ? d.notes               : old.notes,
      JSON.stringify(history),
      id,
    ]
  );

  res.json(rowToTask(db.get(`SELECT * FROM tasks WHERE id = ?`, [id])));
});

app.delete('/api/tasks/:id', (req, res) => {
  const info = db.run(`DELETE FROM tasks WHERE id = ?`, [req.params.id]);
  if (info.changes === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json({ ok: true });
});

/* ============================================================
   RECURSOS
============================================================ */
app.get('/api/resources', (req, res) => {
  res.json(db.all(`SELECT * FROM resources ORDER BY name ASC`));
});

app.post('/api/resources', (req, res) => {
  const { name, type, status } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nome e tipo são obrigatórios.' });
  const id = `REC-${Date.now()}`;
  db.run(`INSERT INTO resources (id, name, type, status) VALUES (?, ?, ?, ?)`,
    [id, name, type, status || 'DISPONIVEL']);
  res.status(201).json(db.get(`SELECT * FROM resources WHERE id = ?`, [id]));
});

app.put('/api/resources/:id', (req, res) => {
  const { id } = req.params;
  const old = db.get(`SELECT * FROM resources WHERE id = ?`, [id]);
  if (!old) return res.status(404).json({ error: 'Recurso não encontrado.' });
  const { name, type, status } = req.body;
  db.run(`UPDATE resources SET name = ?, type = ?, status = ? WHERE id = ?`,
    [name ?? old.name, type ?? old.type, status ?? old.status, id]);
  res.json(db.get(`SELECT * FROM resources WHERE id = ?`, [id]));
});

app.delete('/api/resources/:id', (req, res) => {
  const info = db.run(`DELETE FROM resources WHERE id = ?`, [req.params.id]);
  if (info.changes === 0) return res.status(404).json({ error: 'Recurso não encontrado.' });
  res.json({ ok: true });
});

/* ============================================================
   TIPOS DE RECURSO
============================================================ */
app.get('/api/resource-types', (req, res) => {
  res.json(db.all(`SELECT name FROM resource_types ORDER BY name ASC`).map(r => r.name));
});

app.post('/api/resource-types', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório.' });
  db.run(`INSERT OR IGNORE INTO resource_types (name) VALUES (?)`, [name.toUpperCase()]);
  res.status(201).json({ name: name.toUpperCase() });
});

/* ============================================================
   STATUSES / BUCKETS
============================================================ */
app.get('/api/statuses', (req, res) => {
  res.json(db.all(`SELECT * FROM statuses ORDER BY position ASC`));
});

app.post('/api/statuses', (req, res) => {
  const { label, color } = req.body;
  if (!label) return res.status(400).json({ error: 'Label obrigatório.' });

  const baseKey = (label || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').slice(0, 20);
  const key = baseKey + '_' + Date.now().toString(36).toUpperCase().slice(-4);

  const maxRow  = db.get(`SELECT MAX(position) as m FROM statuses`);
  const maxPos  = (maxRow?.m ?? -1);

  db.run(`INSERT INTO statuses (key, label, color, position) VALUES (?, ?, ?, ?)`,
    [key, label.toUpperCase(), color || '#6b7280', maxPos + 1]);

  res.status(201).json(db.get(`SELECT * FROM statuses WHERE key = ?`, [key]));
});

app.put('/api/statuses/:key', (req, res) => {
  const { key } = req.params;
  const old = db.get(`SELECT * FROM statuses WHERE key = ?`, [key]);
  if (!old) return res.status(404).json({ error: 'Bucket não encontrado.' });
  const { label, color } = req.body;
  db.run(`UPDATE statuses SET label = ?, color = ? WHERE key = ?`,
    [label ?? old.label, color ?? old.color, key]);
  res.json(db.get(`SELECT * FROM statuses WHERE key = ?`, [key]));
});

app.delete('/api/statuses/:key', (req, res) => {
  const info = db.run(`DELETE FROM statuses WHERE key = ?`, [req.params.key]);
  if (info.changes === 0) return res.status(404).json({ error: 'Bucket não encontrado.' });
  res.json({ ok: true });
});

app.post('/api/statuses/reorder', (req, res) => {
  const { orderedKeys } = req.body;
  if (!Array.isArray(orderedKeys)) return res.status(400).json({ error: 'orderedKeys deve ser array.' });
  orderedKeys.forEach((k, i) => db.run(`UPDATE statuses SET position = ? WHERE key = ?`, [i, k]));
  db.persist();
  res.json(db.all(`SELECT * FROM statuses ORDER BY position ASC`));
});

/* ============================================================
   PREFERÊNCIAS
============================================================ */
app.get('/api/prefs', (req, res) => {
  const rows = db.all(`SELECT key, value FROM preferences`);
  res.json(rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {}));
});

app.put('/api/prefs/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  db.run(`INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)`, [key, String(value)]);
  res.json({ key, value });
});

/* ============================================================
   FALLBACK → index.html (SPA)
============================================================ */
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ============================================================
   START
============================================================ */
db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log(`  ║  Priority Manager  →  http://localhost:${PORT}  ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
    console.log('  Banco de dados SQLite iniciado com sucesso.');
    console.log('  Arquivo: database/priority_manager.db');
    console.log('');
  });
}).catch(err => {
  console.error('Erro ao inicializar banco de dados:', err);
  process.exit(1);
});
