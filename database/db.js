/**
 * database/db.js
 * Banco de dados SQLite usando sql.js (puro JavaScript/WASM – sem compilação).
 *
 * Os dados são persisitidos em disco como arquivo binário .db.
 * A cada escrita o arquivo é salvo atomicamente.
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'priority_manager.db');

let db;  // instância do sql.js Database

/* ============================================================
   INIT – carrega o sql.js e abre/cria o banco
   Exporta uma Promise que resolve com o db pronto.
============================================================ */
async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  createSchema();
  seedDefaults();
  persist(); // salva o arquivo já com o schema criado

  return db;
}

/* ============================================================
   PERSIST – serializa o db em memória para o arquivo .db
============================================================ */
function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/* ============================================================
   SCHEMA
============================================================ */
function createSchema() {
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

    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      username  TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      role      TEXT NOT NULL DEFAULT 'user'
    );
  `);

  // Migração: adiciona colunas novas ao banco já existente (seguro com IF NOT EXISTS)
  const taskCols = db.exec(`PRAGMA table_info(tasks)`);
  const colNames = taskCols[0]?.values?.map(r => r[1]) || [];
  if (!colNames.includes('progress'))  db.run(`ALTER TABLE tasks ADD COLUMN progress  INTEGER DEFAULT 0`);
  if (!colNames.includes('checklist')) db.run(`ALTER TABLE tasks ADD COLUMN checklist TEXT    DEFAULT '[]'`);
  if (!colNames.includes('comments'))  db.run(`ALTER TABLE tasks ADD COLUMN comments  TEXT    DEFAULT '[]'`);
  if (!colNames.includes('is_critical')) db.run(`ALTER TABLE tasks ADD COLUMN is_critical INTEGER DEFAULT 0`);

  // Insere padrões de preferências se não existirem
  db.run(`INSERT OR IGNORE INTO preferences (key, value) VALUES ('theme', 'dark')`);
  db.run(`INSERT OR IGNORE INTO preferences (key, value) VALUES ('sidebarCollapsed', 'false')`);

  // Tipos padrão
  db.run(`INSERT OR IGNORE INTO resource_types (name) VALUES ('PROGRAMADOR')`);
  db.run(`INSERT OR IGNORE INTO resource_types (name) VALUES ('ANALISTA')`);
}

/* ============================================================
   SEED – buckets padrão na primeira execução
============================================================ */
function seedDefaults() {
  /* Áreas solicitantes padrão */
  const areaDefaults = [
    'PCP', 'EXPEDIÇÃO', 'PERSONAL CARE', 'CONVERSÃO',
    'FABRICAÇÃO', 'CD', 'RECEBIMENTO', 'QUALIDADE',
  ];
  areaDefaults.forEach(a => {
    db.run(`INSERT OR IGNORE INTO areas (name) VALUES (?)`, [a]);
  });

  const count = db.exec(`SELECT COUNT(*) as n FROM statuses`);
  const n = count[0]?.values[0][0] || 0;
  if (n > 0) return;

  const defaults = [
    { key: 'PENDENTE', label: 'PENDENTE', color: '#6b7280', position: 0 },
    { key: 'LEVANTAMENTO', label: 'LEVANTAMENTO', color: '#7c3aed', position: 1 },
    { key: 'EM_DESENVOLVIMENTO', label: 'EM DESENVOLVIMENTO', color: '#2563eb', position: 2 },
    { key: 'SUBIR_HML', label: 'SUBIR EM HML', color: '#ca8a04', position: 3 },
    { key: 'HML_TESTE_DEV', label: 'HML TESTE DEV', color: '#f97316', position: 4 },
    { key: 'HML_TESTE_SANTHER', label: 'HML TESTE SANTHER', color: '#ea580c', position: 5 },
    { key: 'OK_HML', label: 'OK EM HML', color: '#0d9488', position: 6 },
    { key: 'SUBIR_PROD', label: 'SUBIR EM PROD', color: '#d97706', position: 7 },
    { key: 'PROD', label: 'PROD', color: '#16a34a', position: 8 },
    { key: 'CONCLUIDO', label: 'CONCLU\u00cdDO', color: '#166534', position: 9 },
  ];
  defaults.forEach(s => {
    db.run(
      `INSERT INTO statuses (key, label, color, position) VALUES (?, ?, ?, ?)`,
      [s.key, s.label, s.color, s.position]
    );
  });

  /* Seed do usuário admin padrão */
  seedAdminUser();
}

/* ============================================================
   SEED ADMIN – cria admin padrão se não existir
============================================================ */
function seedAdminUser() {
  const existing = get(`SELECT id FROM users WHERE username = 'admin'`);
  if (existing) return;
  const hash = bcrypt.hashSync('santher2026', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', ?, 'admin')`, [hash]);
  persist();
  console.log('  [Auth] Usuário admin criado.');
}

/* ============================================================
   HELPERS de query
============================================================ */

/** Executa um SELECT e retorna array de objetos */
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

/** Executa um SELECT e retorna o primeiro objeto ou null */
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

/** Executa INSERT / UPDATE / DELETE e persiste.
 *  Retorna { changes } como better-sqlite3 */
function run(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified(); // captura ANTES do persist()
  persist();
  return { changes };
}

/** Próximo ID de tarefa */
function getNextTaskId() {
  const row = get(`SELECT value FROM task_counter WHERE id = 1`);
  const n = (row?.value || 0) + 1;
  db.run(`UPDATE task_counter SET value = ? WHERE id = 1`, [n]);
  persist();
  return `TASK-${String(n).padStart(3, '0')}`;
}

module.exports = { initDb, all, get, run, getNextTaskId, persist, bcrypt };
