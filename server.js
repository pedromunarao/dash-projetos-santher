/**
 * server.js – API REST do Priority Manager com suporte a Workspaces
 * Express + SQLite via sql.js (puro JS, sem compilação nativa)
 *
 * Para iniciar: node server.js
 * Acesse em:    http://localhost:3000
 */

const express  = require('express');
const path     = require('path');
const session  = require('express-session');
const db       = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* ============================================================
   SESSÃO
============================================================ */
app.use(session({
  secret: 'santher-priority-manager-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
  },
}));

/* ============================================================
   SERVIR ARQUIVOS ESTÁTICOS
============================================================ */
app.use('/css',    express.static(path.join(__dirname, 'css')));
app.use('/js',     express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

/* ============================================================
   MIDDLEWARES
============================================================ */

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Não autenticado.' });
}

function requireAdmin(req, res, next) {
  if (req.session?.user?.role === 'admin') return next();
  return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
}

function requireWorkspace(req, res, next) {
  if (req.session?.workspaceId) return next();
  return res.status(403).json({ error: 'Nenhum workspace selecionado.' });
}

// Injeta os helpers do workspace atual no req
function injectWorkspaceDb(req, res, next) {
  const wsId = req.session?.workspaceId;
  if (!wsId) return next();
  req.ws = db.makeWorkspaceHelpers(wsId);
  next();
}

/* ============================================================
   ROTAS DE AUTENTICAÇÃO (públicas)
============================================================ */

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });

  const user = db.globalGet(`SELECT * FROM users WHERE username = ?`, [username.trim().toLowerCase()]);
  if (!user)
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });

  const match = db.bcrypt.compareSync(password, user.password);
  if (!match)
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });

  req.session.user = { id: user.id, username: user.username, role: user.role };
  delete req.session.workspaceId; // garante que não herda workspace de sessão anterior
  res.json({ ok: true, user: req.session.user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Usuário atual
app.get('/api/auth/me', (req, res) => {
  if (req.session?.user) return res.json({ user: req.session.user });
  return res.status(401).json({ error: 'Não autenticado.' });
});

// Cadastrar usuário (apenas admin)
app.post('/api/auth/register', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });

  const clean = username.trim().toLowerCase();
  const existing = db.globalGet(`SELECT id FROM users WHERE username = ?`, [clean]);
  if (existing)
    return res.status(409).json({ error: 'Usuário já existe.' });

  const hash = db.bcrypt.hashSync(password, 10);
  const validRole = role === 'admin' ? 'admin' : 'user';
  db.globalRun(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [clean, hash, validRole]);
  const newUser = db.globalGet(`SELECT id, username, role FROM users WHERE username = ?`, [clean]);
  res.status(201).json({ user: newUser });
});

// Listar usuários (apenas admin)
app.get('/api/auth/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.globalAll(`SELECT id, username, role FROM users ORDER BY username ASC`);
  res.json(users);
});

// Excluir usuário (apenas admin, não pode excluir a si mesmo)
app.delete('/api/auth/users/:id', requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.session.user.id)
    return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário.' });

  const info = db.globalRun(`DELETE FROM users WHERE id = ?`, [targetId]);
  if (info.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json({ ok: true });
});

/* ============================================================
   ROTAS DE WORKSPACE
============================================================ */

// Listar workspaces
app.get('/api/workspaces', requireAuth, (req, res) => {
  const rows = db.globalAll(`SELECT id, name, owner_id, created_at, (password IS NOT NULL) as has_password FROM workspaces ORDER BY created_at ASC`);
  res.json(rows.map(w => ({
    id:         w.id,
    name:       w.name,
    ownerId:    w.owner_id,
    createdAt:  w.created_at,
    hasPassword: !!w.has_password,
  })));
});

// Criar workspace (apenas admin)
app.post('/api/workspaces', requireAuth, requireAdmin, (req, res) => {
  const { name, password } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Nome do workspace obrigatório.' });

  // Gera slug a partir do nome
  const slug = name.trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40)
    + '-' + Date.now().toString(36);

  const existing = db.globalGet(`SELECT id FROM workspaces WHERE id = ?`, [slug]);
  if (existing)
    return res.status(409).json({ error: 'Workspace já existe.' });

  const hash = password ? db.bcrypt.hashSync(password, 10) : null;
  const now  = new Date().toISOString();

  db.globalRun(
    `INSERT INTO workspaces (id, name, password, owner_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    [slug, name.trim(), hash, req.session.user.id, now]
  );

  // Inicializa o banco do workspace
  db.makeWorkspaceHelpers(slug);

  res.status(201).json({ id: slug, name: name.trim(), hasPassword: !!password });
});

// Renomear workspace (apenas admin)
app.put('/api/workspaces/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, password, removePassword } = req.body;

  const ws = db.globalGet(`SELECT * FROM workspaces WHERE id = ?`, [id]);
  if (!ws) return res.status(404).json({ error: 'Workspace não encontrado.' });

  let newHash = ws.password;
  if (removePassword) newHash = null;
  else if (password)  newHash = db.bcrypt.hashSync(password, 10);

  db.globalRun(
    `UPDATE workspaces SET name = ?, password = ? WHERE id = ?`,
    [name ?? ws.name, newHash, id]
  );

  res.json({ ok: true });
});

// Excluir workspace (apenas admin)
app.delete('/api/workspaces/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { adminPassword } = req.body;
  
  if (!adminPassword) {
    return res.status(400).json({ error: 'Senha de administrador é obrigatória para excluir o workspace.' });
  }

  const user = db.globalGet(`SELECT * FROM users WHERE id = ?`, [req.session.user.id]);
  if (!user || !db.bcrypt.compareSync(adminPassword, user.password)) {
    return res.status(401).json({ error: 'Senha de administrador incorreta.' });
  }

  if (id === 'padrao') {
    return res.status(400).json({ error: 'Não é possível excluir o workspace padrão.' });
  }

  const ws = db.globalGet(`SELECT * FROM workspaces WHERE id = ?`, [id]);
  if (!ws) return res.status(404).json({ error: 'Workspace não encontrado.' });

  const info = db.globalRun(`DELETE FROM workspaces WHERE id = ?`, [id]);
  if (info.changes === 0) return res.status(404).json({ error: 'Workspace não encontrado.' });

  // Apaga o banco do workspace e tira do cache
  db.deleteWorkspaceDb(id);

  // Se o usuário atual estava nesse workspace, tira da sessão
  if (req.session.workspaceId === id) {
    delete req.session.workspaceId;
    delete req.session.workspaceName;
  }

  res.json({ ok: true });
});

// Entrar num workspace
app.post('/api/workspaces/:id/join', requireAuth, (req, res) => {
  const { id }       = req.params;
  const { password } = req.body;

  const ws = db.globalGet(`SELECT * FROM workspaces WHERE id = ?`, [id]);
  if (!ws) return res.status(404).json({ error: 'Workspace não encontrado.' });

  if (ws.password) {
    if (!password)
      return res.status(401).json({ error: 'Este workspace requer senha.' });
    const match = db.bcrypt.compareSync(password, ws.password);
    if (!match)
      return res.status(401).json({ error: 'Senha do workspace incorreta.' });
  }

  req.session.workspaceId   = ws.id;
  req.session.workspaceName = ws.name;
  res.json({ ok: true, workspaceId: ws.id, workspaceName: ws.name });
});

// Sair do workspace (volta para seleção)
app.post('/api/workspaces/leave', requireAuth, (req, res) => {
  delete req.session.workspaceId;
  delete req.session.workspaceName;
  res.json({ ok: true });
});

/* ============================================================
   APPLY requireAuth em todas as /api/* (exceto /api/auth/*)
============================================================ */
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/'))       return next();
  if (req.path.startsWith('/workspaces'))  return next();
  return requireAuth(req, res, next);
});

// Para as rotas de dados, exige workspace selecionado e injeta helpers
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/'))      return next();
  if (req.path.startsWith('/workspaces')) return next();
  if (!req.session?.workspaceId)
    return res.status(403).json({ error: 'Nenhum workspace selecionado.' });
  req.ws = db.makeWorkspaceHelpers(req.session.workspaceId);
  next();
});

/* ============================================================
   HELPERS
============================================================ */

function safeJsonParseArray(str) {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch (e) {
    return [str];
  }
}

function rowToTask(row) {
  if (!row) return null;
  return {
    id:          row.id,
    title:       row.title,
    description: row.description || '',
    priority:    row.priority,
    status:      row.status,
    area:        safeJsonParseArray(row.area || '[]'),
    solicitor:   row.solicitor || '',
    resources:   JSON.parse(row.resources || '[]'),
    openedAt:    row.opened_at,
    dueDate:     row.due_date || '',
    closedAt:    row.closed_at || '',
    notes:       row.notes || '',
    history:     JSON.parse(row.history || '[]'),
    progress:    row.progress || 0,
    checklist:   JSON.parse(row.checklist || '[]'),
    comments:    JSON.parse(row.comments  || '[]'),
    isCritical:  !!row.is_critical,
    projectType: safeJsonParseArray(row.project_type || '[]'),
  };
}

function getStatusLabel(wsHelpers, key) {
  const row = wsHelpers.get(`SELECT label FROM statuses WHERE key = ?`, [key]);
  return row?.label || key;
}

/* ============================================================
   BOOTSTRAP
============================================================ */
app.get('/api/bootstrap', (req, res) => {
  const ws = req.ws;
  const tasks     = ws.all(`SELECT * FROM tasks ORDER BY priority ASC`).map(rowToTask);
  const resources = ws.all(`SELECT * FROM resources ORDER BY name ASC`);
  const types     = ws.all(`SELECT name FROM resource_types ORDER BY name ASC`).map(r => r.name);
  const statuses  = ws.all(`SELECT * FROM statuses ORDER BY position ASC`);
  const areas     = ws.all(`SELECT name FROM areas ORDER BY name ASC`).map(r => r.name);
  const prefRows  = ws.all(`SELECT key, value FROM preferences`);
  const prefs     = prefRows.reduce((acc, p) => { acc[p.key] = p.value; return acc; }, {});

  res.json({
    tasks, resources, resourceTypes: types, statuses, areas, prefs,
    workspaceId:   req.session.workspaceId,
    workspaceName: req.session.workspaceName,
  });
});

/* ============================================================
   ÁREAS SOLICITANTES
============================================================ */
app.get('/api/areas', (req, res) => {
  res.json(req.ws.all(`SELECT name FROM areas ORDER BY name ASC`).map(r => r.name));
});

app.post('/api/areas', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome obrigatório.' });
  const upper = name.trim().toUpperCase();
  req.ws.run(`INSERT OR IGNORE INTO areas (name) VALUES (?)`, [upper]);
  res.status(201).json({ name: upper });
});

app.delete('/api/areas/:name', (req, res) => {
  const info = req.ws.run(`DELETE FROM areas WHERE name = ?`, [req.params.name]);
  if (info.changes === 0) return res.status(404).json({ error: 'Área não encontrada.' });
  res.json({ ok: true });
});

/* ============================================================
   TAREFAS
============================================================ */
app.get('/api/tasks', (req, res) => {
  res.json(req.ws.all(`SELECT * FROM tasks ORDER BY priority ASC`).map(rowToTask));
});

app.post('/api/tasks', (req, res) => {
  const ws  = req.ws;
  const d   = req.body;
  const now = new Date().toISOString();
  const id  = ws.getNextTaskId();
  const closedAt = d.status === 'CONCLUIDO' ? now : '';

  ws.run(
    `INSERT INTO tasks (id, title, description, priority, status, area, solicitor,
                        resources, opened_at, due_date, closed_at, notes, history,
                        progress, checklist, comments, is_critical, project_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      d.title || '',
      d.description || '',
      Number(d.priority) || 0,
      d.status || 'PENDENTE',
      JSON.stringify(d.area || []),
      d.solicitor || '',
      JSON.stringify(d.resources || []),
      now,
      d.dueDate || '',
      closedAt,
      d.notes || '',
      JSON.stringify([{ time: now, text: 'Tarefa criada.' }]),
      Number(d.progress) || 0,
      JSON.stringify(d.checklist || []),
      JSON.stringify(d.comments  || []),
      d.isCritical ? 1 : 0,
      JSON.stringify(d.projectType || []),
    ]
  );

  res.status(201).json(rowToTask(ws.get(`SELECT * FROM tasks WHERE id = ?`, [id])));
});

app.put('/api/tasks/:id', (req, res) => {
  const ws     = req.ws;
  const { id } = req.params;
  const old    = ws.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
  if (!old) return res.status(404).json({ error: 'Tarefa não encontrada.' });

  const d       = req.body;
  const now     = new Date().toISOString();
  const changes = [];

  if (d.title       !== undefined && d.title       !== old.title)       changes.push(`Título: "${old.title}" → "${d.title}"`);
  if (d.status      !== undefined && d.status      !== old.status)      changes.push(`Status: ${getStatusLabel(ws, old.status)} → ${getStatusLabel(ws, d.status)}`);
  if (d.priority    !== undefined && String(d.priority) !== String(old.priority)) changes.push(`Prioridade: ${old.priority} → ${d.priority}`);
  if (d.area !== undefined) {
    const oldA = safeJsonParseArray(old.area || '[]').join(', ');
    const newA = (d.area || []).join(', ');
    if (oldA !== newA) changes.push(`Área: [${oldA || '—'}] → [${newA || '—'}]`);
  }
  if (d.solicitor   !== undefined && d.solicitor   !== old.solicitor)   changes.push(`Solicitante: ${old.solicitor} → ${d.solicitor}`);
  if (d.dueDate     !== undefined && d.dueDate     !== old.due_date)    changes.push(`Data prevista: ${old.due_date || '—'} → ${d.dueDate || '—'}`);
  if (d.notes       !== undefined && d.notes       !== old.notes)       changes.push('Observações atualizadas.');
  if (d.description !== undefined && d.description !== old.description) changes.push('Descrição atualizada.');
  if (d.progress    !== undefined && Number(d.progress) !== old.progress) changes.push(`Progresso: ${old.progress || 0}% → ${d.progress}%`);
  if (d.isCritical  !== undefined && !!d.isCritical !== !!old.is_critical) changes.push(`Marcada como ${d.isCritical ? 'Crítica' : 'Normal'}`);
  if (d.projectType !== undefined) {
    const oldP = safeJsonParseArray(old.project_type || '[]').join(', ');
    const newP = (d.projectType || []).join(', ');
    if (oldP !== newP) changes.push(`Tipo: [${oldP || '—'}] → [${newP || '—'}]`);
  }
  if (d.resources !== undefined) {
    const oldR = JSON.parse(old.resources || '[]').join(', ');
    const newR = (d.resources || []).join(', ');
    if (oldR !== newR) changes.push(`Recursos: [${oldR || '—'}] → [${newR || '—'}]`);
  }

  const history = JSON.parse(old.history || '[]');
  if (changes.length) history.push({ time: now, text: changes.join(' | ') });

  const newStatus = d.status !== undefined ? d.status : old.status;
  let newClosedAt = old.closed_at || '';
  if (newStatus === 'CONCLUIDO' && old.status !== 'CONCLUIDO') {
    newClosedAt = now;
  } else if (newStatus !== 'CONCLUIDO' && old.status === 'CONCLUIDO') {
    newClosedAt = '';
  }

  ws.run(
    `UPDATE tasks SET
       title = ?, description = ?, priority = ?, status = ?,
       area = ?, solicitor = ?, resources = ?,
       due_date = ?, closed_at = ?, notes = ?, history = ?,
       progress = ?, checklist = ?, comments = ?, is_critical = ?, project_type = ?
     WHERE id = ?`,
    [
      d.title       !== undefined ? d.title               : old.title,
      d.description !== undefined ? d.description         : old.description,
      d.priority    !== undefined ? Number(d.priority)    : old.priority,
      newStatus,
      d.area        !== undefined ? JSON.stringify(d.area) : old.area,
      d.solicitor   !== undefined ? d.solicitor           : old.solicitor,
      d.resources   !== undefined ? JSON.stringify(d.resources) : old.resources,
      d.dueDate     !== undefined ? d.dueDate             : old.due_date,
      newClosedAt,
      d.notes       !== undefined ? d.notes               : old.notes,
      JSON.stringify(history),
      d.progress    !== undefined ? Number(d.progress)    : (old.progress || 0),
      d.checklist   !== undefined ? JSON.stringify(d.checklist) : (old.checklist || '[]'),
      d.comments    !== undefined ? JSON.stringify(d.comments)  : (old.comments  || '[]'),
      d.isCritical  !== undefined ? (d.isCritical ? 1 : 0)      : (old.is_critical || 0),
      d.projectType !== undefined ? JSON.stringify(d.projectType) : old.project_type,
      id,
    ]
  );

  res.json(rowToTask(ws.get(`SELECT * FROM tasks WHERE id = ?`, [id])));
});

app.delete('/api/tasks/:id', (req, res) => {
  const info = req.ws.run(`DELETE FROM tasks WHERE id = ?`, [req.params.id]);
  if (info.changes === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json({ ok: true });
});

/* ============================================================
   RECURSOS
============================================================ */
app.get('/api/resources', (req, res) => {
  res.json(req.ws.all(`SELECT * FROM resources ORDER BY name ASC`));
});

app.post('/api/resources', (req, res) => {
  const { name, type, status } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Nome e tipo são obrigatórios.' });
  const id = `REC-${Date.now()}`;
  req.ws.run(`INSERT INTO resources (id, name, type, status) VALUES (?, ?, ?, ?)`,
    [id, name, type, status || 'DISPONIVEL']);
  res.status(201).json(req.ws.get(`SELECT * FROM resources WHERE id = ?`, [id]));
});

app.put('/api/resources/:id', (req, res) => {
  const { id } = req.params;
  const old = req.ws.get(`SELECT * FROM resources WHERE id = ?`, [id]);
  if (!old) return res.status(404).json({ error: 'Recurso não encontrado.' });
  const { name, type, status } = req.body;
  req.ws.run(`UPDATE resources SET name = ?, type = ?, status = ? WHERE id = ?`,
    [name ?? old.name, type ?? old.type, status ?? old.status, id]);
  res.json(req.ws.get(`SELECT * FROM resources WHERE id = ?`, [id]));
});

app.delete('/api/resources/:id', (req, res) => {
  const info = req.ws.run(`DELETE FROM resources WHERE id = ?`, [req.params.id]);
  if (info.changes === 0) return res.status(404).json({ error: 'Recurso não encontrado.' });
  res.json({ ok: true });
});

/* ============================================================
   TIPOS DE RECURSO
============================================================ */
app.get('/api/resource-types', (req, res) => {
  res.json(req.ws.all(`SELECT name FROM resource_types ORDER BY name ASC`).map(r => r.name));
});

app.post('/api/resource-types', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório.' });
  req.ws.run(`INSERT OR IGNORE INTO resource_types (name) VALUES (?)`, [name.toUpperCase()]);
  res.status(201).json({ name: name.toUpperCase() });
});

/* ============================================================
   STATUSES / BUCKETS
============================================================ */
app.get('/api/statuses', (req, res) => {
  res.json(req.ws.all(`SELECT * FROM statuses ORDER BY position ASC`));
});

app.post('/api/statuses', (req, res) => {
  const { label, color } = req.body;
  if (!label) return res.status(400).json({ error: 'Label obrigatório.' });

  const baseKey = (label || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').slice(0, 20);
  const key = baseKey + '_' + Date.now().toString(36).toUpperCase().slice(-4);

  const maxRow = req.ws.get(`SELECT MAX(position) as m FROM statuses`);
  const maxPos = (maxRow?.m ?? -1);

  req.ws.run(`INSERT INTO statuses (key, label, color, position) VALUES (?, ?, ?, ?)`,
    [key, label.toUpperCase(), color || '#6b7280', maxPos + 1]);

  res.status(201).json(req.ws.get(`SELECT * FROM statuses WHERE key = ?`, [key]));
});

app.put('/api/statuses/:key', (req, res) => {
  const { key } = req.params;
  const old = req.ws.get(`SELECT * FROM statuses WHERE key = ?`, [key]);
  if (!old) return res.status(404).json({ error: 'Bucket não encontrado.' });
  const { label, color } = req.body;
  req.ws.run(`UPDATE statuses SET label = ?, color = ? WHERE key = ?`,
    [label ?? old.label, color ?? old.color, key]);
  res.json(req.ws.get(`SELECT * FROM statuses WHERE key = ?`, [key]));
});

app.delete('/api/statuses/:key', (req, res) => {
  const info = req.ws.run(`DELETE FROM statuses WHERE key = ?`, [req.params.key]);
  if (info.changes === 0) return res.status(404).json({ error: 'Bucket não encontrado.' });
  res.json({ ok: true });
});

app.post('/api/statuses/reorder', (req, res) => {
  const { orderedKeys } = req.body;
  if (!Array.isArray(orderedKeys)) return res.status(400).json({ error: 'orderedKeys deve ser array.' });
  orderedKeys.forEach((k, i) => req.ws.run(`UPDATE statuses SET position = ? WHERE key = ?`, [i, k]));
  req.ws.persist();
  res.json(req.ws.all(`SELECT * FROM statuses ORDER BY position ASC`));
});

/* ============================================================
   PREFERÊNCIAS
============================================================ */
app.get('/api/prefs', (req, res) => {
  const rows = req.ws.all(`SELECT key, value FROM preferences`);
  res.json(rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {}));
});

app.put('/api/prefs/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  req.ws.run(`INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)`, [key, String(value)]);
  res.json({ key, value });
});

/* ============================================================
   ROTAS DE NAVEGAÇÃO (HTML)
============================================================ */

// Login
app.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/workspace');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Seleção de workspace
app.get('/workspace', (req, res) => {
  if (!req.session?.user) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'views', 'workspace.html'));
});

// App principal – exige login E workspace
app.get(/^(?!\/(api|login|workspace|css|js|assets)).*/, (req, res) => {
  if (!req.session?.user)        return res.redirect('/login');
  if (!req.session?.workspaceId) return res.redirect('/workspace');
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

/* ============================================================
   START
============================================================ */
db.initDb().then(() => {
  db.startAutoSave(); // ✅ auto-save a cada 30s – proteção contra perda de dados
  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log(`  ║  Priority Manager  →  http://localhost:${PORT}  ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
    console.log('  Banco de dados global iniciado com sucesso.');
    console.log('  Workspaces em: database/workspaces/');
    console.log('  Auto-save ativo: a cada 30 segundos.');
    console.log('');
  });
}).catch(err => {
  console.error('Erro ao inicializar banco de dados:', err);
  process.exit(1);
});
