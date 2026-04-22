/**
 * core/store.js  – versão 2.0 (API + cache em memória)
 *
 * Arquitetura:
 *   - No boot, o App chama Store.bootstrap() que carrega TODOS os dados
 *     da API REST (/api/bootstrap) e preenche o cache em memória.
 *   - As leituras (getTasks, getResources, etc.) são SÍNCRONAS, lendo do cache.
 *   - As escritas (addTask, updateTask, deleteTask, etc.) chamam a API
 *     e atualizam o cache após a resposta.
 *   - Preferências de UI (sidebar, tema) ficam no localStorage por serem
 *     valores imediatos da interface (não precisam de banco).
 *
 * Isso mantém TODA a interface do Store compatível com os módulos existentes,
 * sem exigir que eles se tornem async.  Apenas o boot é async.
 */

const Store = (() => {

  /* ---- Cache em memória ---- */
  const _cache = {
    tasks:         [],
    resources:     [],
    resourceTypes: ['PROGRAMADOR', 'ANALISTA'],
    statuses:      [],
    areas:         [],
  };

  /* ---- Base URL da API ---- */
  const API = '';   // mesma origin – servidor Express serve tudo

  /* ---- Helper de fetch ---- */
  async function api(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body:    body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  /* ==============================================================
     BOOTSTRAP – chamado uma vez no início da aplicação
  ============================================================== */

  /**
   * Carrega todos os dados da API e preenche o cache.
   * Deve ser aguardado (await) antes de inicializar qualquer módulo.
   * @returns {Promise<void>}
   */
  async function bootstrap() {
    try {
      const data = await api('GET', '/api/bootstrap');
      _cache.tasks         = data.tasks         || [];
      _cache.resources     = data.resources     || [];
      _cache.resourceTypes = data.resourceTypes || ['PROGRAMADOR', 'ANALISTA'];
      _cache.statuses      = data.statuses      || [];
      _cache.areas         = data.areas         || [];
    } catch (e) {
      console.error('[Store] Falha no bootstrap:', e.message);
    }
  }

  /* ==============================================================
     TAREFAS  (leitura síncrona, escrita async via API)
  ============================================================== */

  function getTasks()   { return [..._cache.tasks]; }
  function getTask(id)  { return _cache.tasks.find(t => t.id === id) || null; }

  async function addTask(data) {
    const task = await api('POST', '/api/tasks', data);
    _cache.tasks.push(task);
    return task;
  }

  async function updateTask(id, data) {
    const task = await api('PUT', `/api/tasks/${id}`, data);
    const idx  = _cache.tasks.findIndex(t => t.id === id);
    if (idx !== -1) _cache.tasks[idx] = task;
    return task;
  }

  async function deleteTask(id) {
    await api('DELETE', `/api/tasks/${id}`);
    _cache.tasks = _cache.tasks.filter(t => t.id !== id);
  }

  /* ==============================================================
     RECURSOS
  ============================================================== */

  function getResources() { return [..._cache.resources]; }

  async function addResource(data) {
    const r = await api('POST', '/api/resources', data);
    _cache.resources.push(r);
    return r;
  }

  async function updateResource(id, data) {
    const r   = await api('PUT', `/api/resources/${id}`, data);
    const idx = _cache.resources.findIndex(x => x.id === id);
    if (idx !== -1) _cache.resources[idx] = r;
    return r;
  }

  async function deleteResource(id) {
    await api('DELETE', `/api/resources/${id}`);
    _cache.resources = _cache.resources.filter(r => r.id !== id);
  }

  /* ---- Tipos de recurso ---- */
  function getResourceTypes() { return [..._cache.resourceTypes]; }

  async function addResourceType(name) {
    const upper = name.toUpperCase();
    if (_cache.resourceTypes.includes(upper)) return _cache.resourceTypes;
    await api('POST', '/api/resource-types', { name: upper });
    _cache.resourceTypes.push(upper);
    _cache.resourceTypes.sort();
    return _cache.resourceTypes;
  }

  /* ==============================================================
     ÁREAS SOLICITANTES
  ============================================================== */

  function getAreas() { return [..._cache.areas]; }

  async function addArea(name) {
    const upper = name.trim().toUpperCase();
    if (_cache.areas.includes(upper)) return _cache.areas;
    await api('POST', '/api/areas', { name: upper });
    _cache.areas.push(upper);
    _cache.areas.sort();
    return _cache.areas;
  }

  async function deleteArea(name) {
    await api('DELETE', `/api/areas/${encodeURIComponent(name)}`);
    _cache.areas = _cache.areas.filter(a => a !== name);
    return _cache.areas;
  }

  /* ==============================================================
     STATUSES / BUCKETS DO KANBAN
  ============================================================== */

  function getStatuses() { return [..._cache.statuses]; }

  function saveStatuses(statuses) {
    // Usado pelo módulo kanban-config para restaurar padrões —
    // faz um reorder completo via API.
    _cache.statuses = statuses;
    const keys = statuses.map(s => s.key);
    api('POST', '/api/statuses/reorder', { orderedKeys: keys }).catch(console.error);
  }

  async function addStatus(data) {
    const s = await api('POST', '/api/statuses', data);
    _cache.statuses.push(s);
    return s;
  }

  async function updateStatus(key, data) {
    const s   = await api('PUT', `/api/statuses/${key}`, data);
    const idx = _cache.statuses.findIndex(x => x.key === key);
    if (idx !== -1) _cache.statuses[idx] = s;
    return s;
  }

  async function deleteStatus(key) {
    await api('DELETE', `/api/statuses/${key}`);
    _cache.statuses = _cache.statuses.filter(s => s.key !== key);
  }

  async function reorderStatuses(orderedKeys) {
    const updated = await api('POST', '/api/statuses/reorder', { orderedKeys });
    _cache.statuses = updated;
    return updated;
  }

  /* ==============================================================
     PREFERÊNCIAS DE UI  (localStorage — imediatas, sem round-trip)
  ============================================================== */

  function getSidebarCollapsed()  { return localStorage.getItem('pm_sidebar') === 'true'; }
  function setSidebarCollapsed(v) {
    localStorage.setItem('pm_sidebar', String(v));
    api('PUT', '/api/prefs/sidebarCollapsed', { value: String(v) }).catch(() => {});
  }

  function getTheme()  { return localStorage.getItem('pm_theme') || 'dark'; }
  function setTheme(t) {
    localStorage.setItem('pm_theme', t);
    api('PUT', '/api/prefs/theme', { value: t }).catch(() => {});
  }

  /* ---- API pública ---- */
  return {
    bootstrap,
    // Tarefas
    getTasks, getTask, addTask, updateTask, deleteTask,
    // Recursos
    getResources, addResource, updateResource, deleteResource,
    getResourceTypes, addResourceType,
    // Áreas
    getAreas, addArea, deleteArea,
    // Statuses (Kanban buckets)
    getStatuses, saveStatuses, addStatus, updateStatus, deleteStatus, reorderStatuses,
    // UI prefs
    getSidebarCollapsed, setSidebarCollapsed, getTheme, setTheme,
  };
})();
