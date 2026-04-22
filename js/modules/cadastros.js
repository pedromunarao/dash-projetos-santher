/**
 * modules/cadastros.js
 * Tela unificada de cadastros:
 *   1. Áreas Solicitantes
 *   2. Tipos de Recurso
 *   3. Recursos (pessoas)
 *   4. Buckets do Kanban
 *   5. Usuários (admin only)
 *
 * Depende de: Store, UI, Auth, STATUSES, RESOURCE_STATUSES, getResourceStatusInfo,
 *             escapeHtml (globals)
 */

const Cadastros = (() => {

  let activeSection = 'areas';  // seção ativa

  const SECTIONS = [
    { key: 'areas',    label: 'Áreas Solicitantes', icon: '🏢' },
    { key: 'types',    label: 'Tipos de Recurso',   icon: '🏷️' },
    { key: 'recursos', label: 'Recursos',            icon: '👥' },
    { key: 'kanban',   label: 'Buckets do Kanban',  icon: '🗂️' },
    { key: 'usuarios', label: 'Usuários',           icon: '🔑' },
  ];

  /* ============================================================
     CORES E HELPERS
  ============================================================ */
  const PRESET_COLORS = [
    '#6b7280','#7c3aed','#2563eb','#0891b2',
    '#059669','#16a34a','#ca8a04','#d97706',
    '#ea580c','#dc2626','#db2777','#7e22ce',
  ];
  const AVATAR_COLORS = ['#6366f1','#0d9488','#f97316','#e879f9','#06b6d4','#84cc16','#f43f5e'];

  function avatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  /* ============================================================
     SEÇÃO 1 — ÁREAS SOLICITANTES
  ============================================================ */
  function renderAreas() {
    const areas = Store.getAreas();
    const container = document.getElementById('cad-areas-list');
    if (!container) return;

    if (areas.length === 0) {
      container.innerHTML = `<p class="cad-empty">Nenhuma área cadastrada.</p>`;
      return;
    }

    container.innerHTML = areas.map(a => `
      <div class="cad-chip-item">
        <span class="cad-chip-icon">🏢</span>
        <span class="cad-chip-label">${escapeHtml(a)}</span>
        <button class="cad-chip-del" onclick="Cadastros.deleteArea('${escapeHtml(a)}')" title="Remover">✕</button>
      </div>
    `).join('');
  }

  async function addArea() {
    const input = document.getElementById('cad-new-area');
    const val = (input?.value || '').trim();
    if (!val) { UI.toast('Digite o nome da área.', 'error'); return; }
    try {
      await Store.addArea(val);
      input.value = '';
      renderAreas();
      UI.toast(`Área "${val.toUpperCase()}" adicionada!`, 'success');
    } catch (err) {
      UI.toast('Erro: ' + err.message, 'error');
    }
  }

  async function deleteArea(name) {
    const ok = await UI.confirm('Remover Área', `Deseja remover a área "${name}"?\n\nTarefas existentes com esta área não serão alteradas.`);
    if (!ok) return;
    try {
      await Store.deleteArea(name);
      renderAreas();
      UI.toast(`Área "${name}" removida.`, 'info');
    } catch (err) {
      UI.toast('Erro: ' + err.message, 'error');
    }
  }

  /* ============================================================
     SEÇÃO 2 — TIPOS DE RECURSO
  ============================================================ */
  function renderTypes() {
    const types = Store.getResourceTypes();
    const container = document.getElementById('cad-types-list');
    if (!container) return;

    if (types.length === 0) {
      container.innerHTML = `<p class="cad-empty">Nenhum tipo cadastrado.</p>`;
      return;
    }

    container.innerHTML = types.map(t => `
      <div class="cad-chip-item">
        <span class="cad-chip-icon">🏷️</span>
        <span class="cad-chip-label">${escapeHtml(t)}</span>
      </div>
    `).join('');
  }

  async function addType() {
    const input = document.getElementById('cad-new-type');
    const val = (input?.value || '').trim();
    if (!val) { UI.toast('Digite o nome do tipo.', 'error'); return; }
    try {
      await Store.addResourceType(val);
      input.value = '';
      renderTypes();
      UI.toast(`Tipo "${val.toUpperCase()}" adicionado!`, 'success');
    } catch (err) {
      UI.toast('Erro: ' + err.message, 'error');
    }
  }

  /* ============================================================
     SEÇÃO 3 — RECURSOS
  ============================================================ */
  function renderRecursos() {
    const resources = Store.getResources();
    const grid = document.getElementById('cad-recursos-grid');
    if (!grid) return;

    if (resources.length === 0) {
      grid.innerHTML = `
        <div class="cad-empty-full">
          <div style="font-size:2.5rem;margin-bottom:12px">👥</div>
          <p>Nenhum recurso cadastrado ainda.</p>
        </div>`;
      return;
    }

    grid.innerHTML = resources.map(r => {
      const info     = getResourceStatusInfo(r.status);
      const initials = r.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
      const color    = avatarColor(r.name);
      const tasks    = Store.getTasks().filter(t =>
        (t.resources || []).includes(r.name) && t.status !== 'CONCLUIDO');

      return `
        <div class="cad-resource-card" id="cad-rc-${r.id}">
          <div class="cad-resource-card-top">
            <div class="cad-resource-avatar" style="background:${color}">${initials}</div>
            <div class="cad-resource-info">
              <div class="cad-resource-name">${escapeHtml(r.name)}</div>
              <div class="cad-resource-type">${escapeHtml(r.type)}</div>
            </div>
            <span class="resource-status-badge ${info.cssClass}">${info.label}</span>
          </div>
          <div class="cad-resource-tasks">
            📋 ${tasks.length} tarefa(s) ativa(s)
          </div>
          <div class="cad-resource-actions">
            <button class="btn btn-ghost btn-sm" onclick="Cadastros.openEditRecurso('${r.id}')">✏️ Editar</button>
            <button class="btn btn-danger btn-sm" onclick="Cadastros.removeRecurso('${r.id}')">🗑️</button>
          </div>
        </div>`;
    }).join('');
  }

  function openNewRecurso() {
    document.getElementById('cad-rec-edit-id').value          = '';
    document.getElementById('cad-rec-form-title').textContent = 'Novo Recurso';
    document.getElementById('cad-rec-form').reset();
    populateRecursoSelects();
    showRecursoForm(true);
  }

  function openEditRecurso(id) {
    const r = Store.getResources().find(x => x.id === id);
    if (!r) return;
    document.getElementById('cad-rec-edit-id').value          = r.id;
    document.getElementById('cad-rec-form-title').textContent = 'Editar Recurso';
    populateRecursoSelects();
    document.getElementById('cad-rec-name').value   = r.name;
    document.getElementById('cad-rec-type').value   = r.type;
    document.getElementById('cad-rec-status').value = r.status;
    showRecursoForm(true);
  }

  function populateRecursoSelects() {
    document.getElementById('cad-rec-type').innerHTML =
      Store.getResourceTypes().map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('cad-rec-status').innerHTML =
      RESOURCE_STATUSES.map(s => `<option value="${s.key}">${s.label}</option>`).join('');
  }

  function showRecursoForm(show) {
    const el = document.getElementById('cad-rec-form-card');
    if (!el) return;
    el.classList.toggle('hidden', !show);
    if (show) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function removeRecurso(id) {
    const r = Store.getResources().find(x => x.id === id);
    if (!r) return;
    const ok = await UI.confirm('Excluir Recurso', `Deseja excluir o recurso "${r.name}"?`);
    if (!ok) return;
    try {
      await Store.deleteResource(id);
      renderRecursos();
      UI.toast('Recurso excluído.', 'info');
    } catch (err) {
      UI.toast('Erro ao excluir: ' + err.message, 'error');
    }
  }

  async function onRecursoSubmit(e) {
    e.preventDefault();
    const name   = document.getElementById('cad-rec-name').value.trim();
    const type   = document.getElementById('cad-rec-type').value;
    const status = document.getElementById('cad-rec-status').value;
    const editId = document.getElementById('cad-rec-edit-id').value;

    if (!name || !type) { UI.toast('Nome e tipo são obrigatórios.', 'error'); return; }

    try {
      if (editId) {
        await Store.updateResource(editId, { name, type, status });
        UI.toast('Recurso atualizado!', 'success');
      } else {
        await Store.addResource({ name, type, status });
        UI.toast('Recurso cadastrado!', 'success');
      }
      showRecursoForm(false);
      renderRecursos();
    } catch (err) {
      UI.toast('Erro ao salvar: ' + err.message, 'error');
    }
  }

  /* ============================================================
     SEÇÃO 4 — BUCKETS DO KANBAN
  ============================================================ */
  let dragSrcKey = null;

  function renderKanban() {
    const statuses = Store.getStatuses();
    const list = document.getElementById('cad-kanban-list');
    if (!list) return;

    list.innerHTML = statuses.map(s => `
      <div class="cad-bucket-row" draggable="true" data-key="${s.key}">
        <span class="cad-bucket-drag">⠿</span>
        <span class="cad-bucket-dot" style="background:${s.color}"></span>
        <span class="cad-bucket-label">${escapeHtml(s.label)}</span>
        <div class="cad-bucket-actions">
          <input type="color" class="cad-bucket-color-pick" value="${s.color}"
            data-key="${s.key}" title="Mudar cor" />
          <button class="btn btn-danger btn-sm" onclick="Cadastros.deleteBucket('${s.key}')">🗑️</button>
        </div>
      </div>
    `).join('');

    // Eventos de cor
    list.querySelectorAll('.cad-bucket-color-pick').forEach(input => {
      input.addEventListener('change', async () => {
        try {
          await Store.updateStatus(input.dataset.key, { color: input.value });
          if (typeof refreshStatuses === 'function') refreshStatuses();
          renderKanban();
          UI.toast('Cor atualizada!', 'success');
        } catch (err) {
          UI.toast('Erro ao atualizar cor: ' + err.message, 'error');
        }
      });
    });

    // Drag-and-drop
    list.querySelectorAll('.cad-bucket-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragSrcKey = row.dataset.key;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        list.querySelectorAll('.cad-bucket-row').forEach(r => r.classList.remove('drag-over'));
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        list.querySelectorAll('.cad-bucket-row').forEach(r => r.classList.remove('drag-over'));
        row.classList.add('drag-over');
      });
      row.addEventListener('drop', async e => {
        e.preventDefault();
        if (dragSrcKey === row.dataset.key) return;
        const rows   = [...list.querySelectorAll('.cad-bucket-row')];
        const srcIdx = rows.findIndex(r => r.dataset.key === dragSrcKey);
        const dstIdx = rows.findIndex(r => r.dataset.key === row.dataset.key);
        const keys   = rows.map(r => r.dataset.key);
        keys.splice(srcIdx, 1);
        keys.splice(dstIdx, 0, dragSrcKey);
        try {
          await Store.reorderStatuses(keys);
          if (typeof refreshStatuses === 'function') refreshStatuses();
          renderKanban();
        } catch (err) {
          UI.toast('Erro ao reordenar: ' + err.message, 'error');
        }
      });
    });
  }

  async function addBucket() {
    const labelInput = document.getElementById('cad-new-bucket-label');
    const colorInput = document.getElementById('cad-new-bucket-color');
    const label = (labelInput?.value || '').trim();
    if (!label) { UI.toast('Digite o nome do bucket.', 'error'); return; }
    try {
      await Store.addStatus({ label, color: colorInput?.value || '#6366f1' });
      if (typeof refreshStatuses === 'function') refreshStatuses();
      labelInput.value = '';
      if (colorInput) colorInput.value = '#6366f1';
      renderKanban();
      UI.toast(`Bucket "${label.toUpperCase()}" criado!`, 'success');
    } catch (err) {
      UI.toast('Erro: ' + err.message, 'error');
    }
  }

  async function deleteBucket(key) {
    const s = Store.getStatuses().find(x => x.key === key);
    if (!s) return;
    const tasks = Store.getTasks().filter(t => t.status === key);
    if (tasks.length > 0) {
      UI.toast(`Este bucket possui ${tasks.length} tarefa(s) vinculada(s). Remapear antes de excluir.`, 'error');
      return;
    }
    const ok = await UI.confirm('Excluir Bucket', `Excluir o bucket "${s.label}"?`);
    if (!ok) return;
    try {
      await Store.deleteStatus(key);
      if (typeof refreshStatuses === 'function') refreshStatuses();
      renderKanban();
      UI.toast('Bucket excluído.', 'info');
    } catch (err) {
      UI.toast('Erro: ' + err.message, 'error');
    }
  }

  /* ============================================================
     SEÇÃO 5 — USUÁRIOS (admin only)
  ============================================================ */
  let _usersCache = [];

  async function renderUsers() {
    if (!Auth.isAdmin()) return;
    const container = document.getElementById('cad-users-list');
    if (!container) return;

    try {
      const res  = await fetch('/api/auth/users');
      _usersCache = await res.json();
    } catch {
      container.innerHTML = `<p class="cad-empty">Erro ao carregar usuários.</p>`;
      return;
    }

    const me = Auth.getCurrentUser();

    if (_usersCache.length === 0) {
      container.innerHTML = `<p class="cad-empty">Nenhum usuário cadastrado.</p>`;
      return;
    }

    container.innerHTML = _usersCache.map(u => {
      const initials = u.username.slice(0, 2).toUpperCase();
      const isSelf   = u.id === me?.id;
      return `
        <div class="cad-user-row" id="cad-user-row-${u.id}">
          <div class="cad-user-avatar">${initials}</div>
          <div class="cad-user-info">
            <div class="cad-user-name">
              ${escapeHtml(u.username)}
              ${isSelf ? `<span class="cad-user-self-badge">você</span>` : ''}
            </div>
            <span class="cad-user-role-badge ${u.role}">${u.role === 'admin' ? 'Administrador' : 'Usuário'}</span>
          </div>
          ${!isSelf ? `
            <button class="btn btn-danger btn-sm" onclick="Cadastros.deleteUser(${u.id})">🗑️ Remover</button>
          ` : ''}
        </div>`;
    }).join('');
  }

  async function addUser() {
    const usernameInp = document.getElementById('cad-new-user-username');
    const passwordInp = document.getElementById('cad-new-user-password');
    const roleInp     = document.getElementById('cad-new-user-role');

    const username = (usernameInp?.value || '').trim();
    const password = (passwordInp?.value || '').trim();
    const role     = roleInp?.value || 'user';

    if (!username || !password) {
      UI.toast('Preencha o usuário e a senha.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar usuário.');
      usernameInp.value = '';
      passwordInp.value = '';
      await renderUsers();
      UI.toast(`Usuário "${username}" criado com sucesso!`, 'success');
    } catch (err) {
      UI.toast('Erro: ' + err.message, 'error');
    }
  }

  async function deleteUser(id) {
    const u = _usersCache.find(x => x.id === id);
    if (!u) return;
    const ok = await UI.confirm('Remover Usuário', `Deseja remover o usuário "${u.username}"? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao remover.');
      await renderUsers();
      UI.toast('Usuário removido.', 'info');
    } catch (err) {
      UI.toast('Erro: ' + err.message, 'error');
    }
  }

  /* ============================================================
     NAVEGAÇÃO DE SEÇÕES
  ============================================================ */
  function switchSection(key) {
    activeSection = key;

    document.querySelectorAll('.cad-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === key);
    });
    document.querySelectorAll('.cad-section').forEach(sec => {
      sec.classList.toggle('hidden', sec.dataset.section !== key);
    });

    if (key === 'areas')     renderAreas();
    if (key === 'types')     renderTypes();
    if (key === 'recursos')  renderRecursos();
    if (key === 'kanban')    renderKanban();
    if (key === 'usuarios')  renderUsers();
  }

  /* ============================================================
     RENDER (chamado ao navegar para a página)
  ============================================================ */
  function render() {
    switchSection(activeSection);
  }

  /* ============================================================
     INIT
  ============================================================ */
  function init() {
    // Tabs
    document.querySelectorAll('.cad-tab').forEach(btn => {
      btn.addEventListener('click', () => switchSection(btn.dataset.section));
    });

    // Áreas
    document.getElementById('cad-add-area-btn')
      ?.addEventListener('click', addArea);
    document.getElementById('cad-new-area')
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') addArea(); });

    // Tipos
    document.getElementById('cad-add-type-btn')
      ?.addEventListener('click', addType);
    document.getElementById('cad-new-type')
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') addType(); });

    // Recursos
    document.getElementById('cad-new-rec-btn')
      ?.addEventListener('click', openNewRecurso);
    document.getElementById('cad-rec-form')
      ?.addEventListener('submit', onRecursoSubmit);
    document.getElementById('cad-rec-cancel')
      ?.addEventListener('click', () => showRecursoForm(false));
    document.getElementById('cad-rec-cancel-foot')
      ?.addEventListener('click', () => showRecursoForm(false));

    // Kanban — adicionar bucket
    document.getElementById('cad-add-bucket-btn')
      ?.addEventListener('click', addBucket);
    document.getElementById('cad-new-bucket-label')
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') addBucket(); });

    // Paleta rápida de cores para novo bucket
    document.querySelectorAll('.cad-bucket-preset-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const pick = document.getElementById('cad-new-bucket-color');
        if (pick) pick.value = dot.dataset.color;
      });
    });

    // Usuários (admin only)
    document.getElementById('cad-add-user-btn')
      ?.addEventListener('click', addUser);
    document.getElementById('cad-new-user-username')
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('cad-new-user-password')?.focus(); });
    document.getElementById('cad-new-user-password')
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') addUser(); });
  }

  return {
    init, render,
    // Expostos para eventos inline
    deleteArea, openEditRecurso, removeRecurso, deleteBucket, deleteUser,
  };
})();
