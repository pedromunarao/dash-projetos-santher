/**
 * database/db.js
 * Banco de dados SQLite usando sql.js (puro JavaScript/WASM – sem compilação).
 *
 * Arquitetura de Workspaces:
 *   - global.db  → usuários + lista de workspaces
 *   - workspaces/<id>.db → todos os dados de cada workspace (tarefas, recursos, etc.)
 */

const path = require('path');
const fs   = require('fs');
const bcrypt = require('bcryptjs');

const GLOBAL_DB_PATH    = path.join(__dirname, 'global.db');
const WORKSPACES_DIR    = path.join(__dirname, 'workspaces');
const LEGACY_DB_PATH    = path.join(__dirname, 'priority_manager.db');

let SQL;          // instância do sql.js
let globalDb;     // banco global (users + workspaces)
const workspaceDbs = {}; // cache: { workspaceId: sql.js Database }

/* ============================================================
   INIT
============================================================ */
async function initDb() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  // Garante que o diretório de workspaces existe
  if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  }

  // ✅ TESTE DE PERMISSÃO DE ESCRITA — falha rápido e claramente
  const testFile = path.join(WORKSPACES_DIR, '.write_test');
  try {
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    console.log('  [DB] Permissão de escrita em database/workspaces/ OK.');
  } catch (err) {
    const msg = [
      '',
      '  ❌ ERRO CRÍTICO: Sem permissão de escrita na pasta de banco de dados!',
      `  Pasta: ${WORKSPACES_DIR}`,
      `  Erro: ${err.message}`,
      '',
      '  🛠 Corrija com:',
      `     sudo chown -R $(whoami) ${path.join(__dirname)}`,
      `     sudo chmod -R 755 ${path.join(__dirname)}`,
      '',
      '  O servidor NÃO pode subir sem permissão de escrita — os dados seriam perdidos!',
      '',
    ].join('\n');
    console.error(msg);
    process.exit(1); // para o servidor — não sobe em modo so-memória silencioso
  }

  // Abre/cria o banco global
  if (fs.existsSync(GLOBAL_DB_PATH)) {
    globalDb = new SQL.Database(fs.readFileSync(GLOBAL_DB_PATH));
  } else {
    globalDb = new SQL.Database();
  }

  createGlobalSchema();
  seedGlobalDefaults();
  persistGlobal();

  // Migração: se existir o banco legado, transforma-o no workspace "padrão"
  migrateLegacyDb();

  return globalDb;
}

/* ============================================================
   PERSIST
============================================================ */
let pendingGlobalSave = null;
function persistGlobal() {
  try {
    fs.writeFileSync(GLOBAL_DB_PATH, Buffer.from(globalDb.export()));
  } catch (err) {
    console.error(`[DB] Erro ao persistir global.db (arquivo em uso?). Tentando novamente em breve...`, err.message);
    if (!pendingGlobalSave) {
      pendingGlobalSave = setTimeout(() => {
        pendingGlobalSave = null;
        persistGlobal();
      }, 500);
    }
  }
}

let pendingWorkspaceSaves = {};
let workspaceSaveFailures = {};
function persistWorkspace(id) {
  const db = workspaceDbs[id];
  if (!db) return;
  const wsPath = path.join(WORKSPACES_DIR, `${id}.db`);
  try {
    fs.writeFileSync(wsPath, Buffer.from(db.export()));
    workspaceSaveFailures[id] = 0; // reset contador de falhas
  } catch (err) {
    workspaceSaveFailures[id] = (workspaceSaveFailures[id] || 0) + 1;
    const failures = workspaceSaveFailures[id];
    console.error(`[DB] ❌ Erro ao persistir workspace ${id} (tentativa ${failures}):`, err.message);

    if (failures >= 3) {
      console.error(`[DB] 🚨 FALHA CRÍTICA: não foi possível salvar workspace "${id}" após ${failures} tentativas!`);
      console.error(`[DB] Verifique permissões em: ${WORKSPACES_DIR}`);
      // Não agenda mais retries — evita acumular timers
      return;
    }

    if (!pendingWorkspaceSaves[id]) {
      pendingWorkspaceSaves[id] = setTimeout(() => {
        delete pendingWorkspaceSaves[id];
        persistWorkspace(id);
      }, 500);
    }
  }
}

/* ============================================================
   AUTO-SAVE PERIÓDICO (segurança extra – a cada 30 segundos)
============================================================ */
function startAutoSave() {
  setInterval(() => {
    try {
      persistGlobal();
      console.log('[DB] Auto-save global.db OK');
    } catch (e) { /* ignorado – persistGlobal já loga */ }

    Object.keys(workspaceDbs).forEach(id => {
      try {
        persistWorkspace(id);
        console.log(`[DB] Auto-save workspace ${id}.db OK`);
      } catch (e) { /* ignorado – persistWorkspace já loga */ }
    });
  }, 30 * 1000); // a cada 30 segundos
}

/* ============================================================
   SCHEMA GLOBAL
============================================================ */
function createGlobalSchema() {
  globalDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      username  TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      role      TEXT NOT NULL DEFAULT 'user'
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      password   TEXT DEFAULT NULL,
      owner_id   INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function seedGlobalDefaults() {
  // Admin padrão
  const existing = globalGet(`SELECT id FROM users WHERE username = 'admin'`);
  if (!existing) {
    const hash = bcrypt.hashSync('santher2026', 10);
    globalDb.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', ?, 'admin')`, [hash]);
    persistGlobal();
    console.log('  [Auth] Usuário admin criado.');
  }
}

/* ============================================================
   MIGRAÇÃO DO BANCO LEGADO → workspace "padrão"
   TAMBÉM: re-registra o workspace padrão se global.db foi resetado
   mas padrao.db ainda existe no disco (evita perda de dados).
============================================================ */
function migrateLegacyDb() {
  const padraoDB = path.join(WORKSPACES_DIR, 'padrao.db');

  // Verifica se o workspace padrão já está registrado no banco global
  const ws = globalGet(`SELECT id FROM workspaces WHERE id = 'padrao'`);

  const adminUser = globalGet(`SELECT id FROM users WHERE username = 'admin'`);
  const ownerId = adminUser?.id || 1;
  const now = new Date().toISOString();

  if (!ws) {
    // Registra o workspace "PADRÃO" no banco global
    globalDb.run(
      `INSERT OR IGNORE INTO workspaces (id, name, password, owner_id, created_at) VALUES (?, ?, NULL, ?, ?)`,
      ['padrao', 'PADRÃO', ownerId, now]
    );
    persistGlobal();

    if (fs.existsSync(padraoDB)) {
      // padrao.db já existe no disco → apenas re-registra, NÃO sobrescreve os dados
      console.log('  [Workspace] global.db foi resetado, mas padrao.db já existe – re-registrando sem perder dados.');
    } else if (fs.existsSync(LEGACY_DB_PATH)) {
      // Migração do banco legado para workspaces/padrao.db
      fs.copyFileSync(LEGACY_DB_PATH, padraoDB);
      console.log('  [Workspace] Banco legado migrado para workspaces/padrao.db');
    }
  }

  // Garante que o workspace padrão tem o schema correto (e carrega em memória)
  getWorkspaceDb('padrao');
  if (!ws) {
    console.log('  [Workspace] Workspace "PADRÃO" inicializado.');
  }
}

/* ============================================================
   WORKSPACE DB — abre e mantém em cache
============================================================ */
function getWorkspaceDb(workspaceId) {
  if (workspaceDbs[workspaceId]) return workspaceDbs[workspaceId];

  const wsPath = path.join(WORKSPACES_DIR, `${workspaceId}.db`);

  let db;
  if (fs.existsSync(wsPath)) {
    db = new SQL.Database(fs.readFileSync(wsPath));
  } else {
    db = new SQL.Database();
  }

  workspaceDbs[workspaceId] = db;
  createWorkspaceSchema(workspaceId);
  seedWorkspaceDefaults(workspaceId);
  persistWorkspace(workspaceId);

  return db;
}

function deleteWorkspaceDb(workspaceId) {
  delete workspaceDbs[workspaceId];
  const wsPath = path.join(WORKSPACES_DIR, `${workspaceId}.db`);
  
  function tryDelete(retries = 5) {
    if (fs.existsSync(wsPath)) {
      try {
        fs.unlinkSync(wsPath);
      } catch (err) {
        console.error(`[DB] Erro ao excluir banco do workspace ${workspaceId}. Tentativas restantes: ${retries - 1}`, err.message);
        if (retries > 1) {
          setTimeout(() => tryDelete(retries - 1), 1000);
        }
      }
    }
  }
  
  tryDelete();
}

/* ============================================================
   SCHEMA DE WORKSPACE
============================================================ */
function createWorkspaceSchema(workspaceId) {
  const db = workspaceDbs[workspaceId];

  db.run(`PRAGMA foreign_keys = ON;`);

  db.run(`
    CREATE TABLE IF NOT EXISTS task_counter (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      value INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO task_counter (id, value) VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority    INTEGER DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'PENDENTE',
      area        TEXT DEFAULT '',
      solicitor   TEXT DEFAULT '',
      resources   TEXT DEFAULT '[]',
      opened_at   TEXT NOT NULL,
      due_date    TEXT DEFAULT '',
      closed_at   TEXT DEFAULT '',
      notes       TEXT DEFAULT '',
      history     TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS resources (
      id     TEXT PRIMARY KEY,
      name   TEXT NOT NULL,
      type   TEXT NOT NULL DEFAULT 'PROGRAMADOR',
      status TEXT NOT NULL DEFAULT 'DISPONIVEL'
    );

    CREATE TABLE IF NOT EXISTS resource_types (
      name TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS statuses (
      key      TEXT PRIMARY KEY,
      label    TEXT NOT NULL,
      color    TEXT NOT NULL DEFAULT '#6b7280',
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS preferences (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS areas (
      name TEXT PRIMARY KEY
    );
  `);

  // Migrações: adiciona colunas novas ao banco já existente
  const taskCols = db.exec(`PRAGMA table_info(tasks)`);
  const colNames = taskCols[0]?.values?.map(r => r[1]) || [];
  if (!colNames.includes('progress'))    db.run(`ALTER TABLE tasks ADD COLUMN progress    INTEGER DEFAULT 0`);
  if (!colNames.includes('checklist'))   db.run(`ALTER TABLE tasks ADD COLUMN checklist   TEXT    DEFAULT '[]'`);
  if (!colNames.includes('comments'))    db.run(`ALTER TABLE tasks ADD COLUMN comments    TEXT    DEFAULT '[]'`);
  if (!colNames.includes('is_critical')) db.run(`ALTER TABLE tasks ADD COLUMN is_critical INTEGER DEFAULT 0`);
  if (!colNames.includes('project_type'))db.run(`ALTER TABLE tasks ADD COLUMN project_type TEXT   DEFAULT 'SISTEMAS'`);

  db.run(`INSERT OR IGNORE INTO preferences (key, value) VALUES ('theme', 'dark')`);
  db.run(`INSERT OR IGNORE INTO preferences (key, value) VALUES ('sidebarCollapsed', 'false')`);
  db.run(`INSERT OR IGNORE INTO resource_types (name) VALUES ('PROGRAMADOR')`);
  db.run(`INSERT OR IGNORE INTO resource_types (name) VALUES ('ANALISTA')`);
}

function seedWorkspaceDefaults(workspaceId) {
  const db = workspaceDbs[workspaceId];

  const count = db.exec(`SELECT COUNT(*) as n FROM statuses`);
  const n = count[0]?.values[0][0] || 0;
  if (n > 0) return; // já tem dados, não re-seeda

  const defaults = [
    { key: 'PENDENTE',            label: 'PENDENTE',            color: '#6b7280', position: 0 },
    { key: 'LEVANTAMENTO',        label: 'LEVANTAMENTO',        color: '#7c3aed', position: 1 },
    { key: 'EM_DESENVOLVIMENTO',  label: 'EM DESENVOLVIMENTO',  color: '#2563eb', position: 2 },
    { key: 'SUBIR_HML',           label: 'SUBIR EM HML',        color: '#ca8a04', position: 3 },
    { key: 'HML_TESTE_DEV',       label: 'HML TESTE DEV',       color: '#f97316', position: 4 },
    { key: 'HML_TESTE_SANTHER',   label: 'HML TESTE SANTHER',   color: '#ea580c', position: 5 },
    { key: 'OK_HML',              label: 'OK EM HML',           color: '#0d9488', position: 6 },
    { key: 'SUBIR_PROD',          label: 'SUBIR EM PROD',       color: '#d97706', position: 7 },
    { key: 'PROD',                label: 'PROD',                color: '#16a34a', position: 8 },
    { key: 'CONCLUIDO',           label: 'CONCLUÍDO',           color: '#166534', position: 9 },
  ];

  defaults.forEach(s => {
    db.run(
      `INSERT INTO statuses (key, label, color, position) VALUES (?, ?, ?, ?)`,
      [s.key, s.label, s.color, s.position]
    );
  });
}

/* ============================================================
   HELPERS GLOBAIS (users/workspaces)
============================================================ */
function globalAll(sql, params = []) {
  const result = globalDb.exec(sql, params);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function globalGet(sql, params = []) {
  return globalAll(sql, params)[0] || null;
}

function globalRun(sql, params = []) {
  globalDb.run(sql, params);
  const changes = globalDb.getRowsModified();
  persistGlobal();
  return { changes };
}

/* ============================================================
   HELPERS DE WORKSPACE (retornam funções bound ao workspace)
============================================================ */
function makeWorkspaceHelpers(workspaceId) {
  const db = getWorkspaceDb(workspaceId);

  function all(sql, params = []) {
    const result = db.exec(sql, params);
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  function get(sql, params = []) {
    return all(sql, params)[0] || null;
  }

  function run(sql, params = []) {
    db.run(sql, params);
    const changes = db.getRowsModified();
    persistWorkspace(workspaceId);
    return { changes };
  }

  function getNextTaskId() {
    const row = get(`SELECT value FROM task_counter WHERE id = 1`);
    const n = (row?.value || 0) + 1;
    db.run(`UPDATE task_counter SET value = ? WHERE id = 1`, [n]);
    persistWorkspace(workspaceId);
    return `TASK-${String(n).padStart(3, '0')}`;
  }

  function persist() {
    persistWorkspace(workspaceId);
  }

  return { all, get, run, getNextTaskId, persist };
}

module.exports = {
  initDb,
  startAutoSave,
  // Global (users + workspaces)
  globalAll,
  globalGet,
  globalRun,
  persistGlobal,
  // Workspace helpers
  makeWorkspaceHelpers,
  deleteWorkspaceDb,
  // Compatibilidade: expõe bcrypt
  bcrypt,
};
