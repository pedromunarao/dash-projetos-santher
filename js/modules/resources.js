/**
 * modules/resources.js
 * Gerenciamento de recursos: CRUD, status e visualização de tarefas vinculadas.
 * Expõe métodos globalmente para uso inline nos botões dos cards.
 *
 * Depende de: Store, UI, TaskForm (globals)
 */

const Resources = (() => {

  /* ---- Preenche selects do form ---- */
  function populateTypeSelect() {
    document.getElementById('resourceType').innerHTML =
      Store.getResourceTypes().map(t => `<option value="${t}">${t}</option>`).join('');
  }

  function populateStatusSelect() {
    document.getElementById('resourceStatus').innerHTML =
      RESOURCE_STATUSES.map(s => `<option value="${s.key}">${s.label}</option>`).join('');
  }

  /* ---- Renderiza a grade de recursos ---- */
  function renderGrid() {
    const resources = Store.getResources();
    const grid      = document.getElementById('resourcesGrid');

    if (resources.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">👥</div>
          <h3>Nenhum recurso cadastrado</h3>
          <p>Cadastre recursos para alocá-los nas tarefas</p>
        </div>`;
      return;
    }

    grid.innerHTML = resources.map(r => {
      const statusInfo  = getResourceStatusInfo(r.status);
      const activeTasks = UI.getTasksForResource(r.name);

      return `
      <div class="resource-card" id="rc-${r.id}">
        <div class="resource-card-header">
          <div>
            <div class="resource-card-name">${escapeHtml(r.name)}</div>
            <div class="resource-card-type">${escapeHtml(r.type)}</div>
          </div>
          <span class="resource-status-badge ${statusInfo.cssClass}">${statusInfo.label}</span>
        </div>

        <div class="resource-tasks-count">
          📋 ${activeTasks.length} tarefa(s) ativa(s)
        </div>

        ${activeTasks.length > 0 ? `
        <div class="resource-tasks-list">
          ${activeTasks.slice(0, 4).map(t => `
            <div class="resource-task-pill">
              <span class="pill-id">${t.id}</span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.title)}</span>
            </div>
          `).join('')}
          ${activeTasks.length > 4 ? `<div class="resource-task-pill">+${activeTasks.length - 4} mais</div>` : ''}
        </div>` : ''}

        <div class="resource-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="Resources.openEdit('${r.id}')">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="Resources.remove('${r.id}')">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }

  /* ---- Abre form para NOVO recurso ---- */
  function openNew() {
    document.getElementById('editResourceId').value           = '';
    document.getElementById('resourceFormTitle').textContent  = 'Novo Recurso';
    document.getElementById('resourceForm').reset();
    populateTypeSelect();
    populateStatusSelect();
    document.getElementById('resourceFormCard').classList.remove('hidden');
    document.getElementById('resourceFormCard').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---- Abre form para EDIÇÃO ---- */
  function openEdit(id) {
    const r = Store.getResources().find(x => x.id === id);
    if (!r) return;

    document.getElementById('editResourceId').value           = r.id;
    document.getElementById('resourceFormTitle').textContent  = 'Editar Recurso';
    populateTypeSelect();
    populateStatusSelect();
    document.getElementById('resourceName').value   = r.name;
    document.getElementById('resourceType').value   = r.type;
    document.getElementById('resourceStatus').value = r.status;
    document.getElementById('resourceFormCard').classList.remove('hidden');
    document.getElementById('resourceFormCard').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---- Remove um recurso ---- */
  async function remove(id) {
    const r = Store.getResources().find(x => x.id === id);
    if (!r) return;

    const ok = await UI.confirm('Excluir Recurso', `Deseja excluir o recurso "${r.name}"?`);
    if (!ok) return;

    try {
      await Store.deleteResource(id);
      renderGrid();
      UI.toast('Recurso excluído.', 'info');
    } catch (err) {
      UI.toast('Erro ao excluir: ' + err.message, 'error');
    }
  }

  /* ---- Submit do form ---- */
  async function onFormSubmit(e) {
    e.preventDefault();
    const name   = document.getElementById('resourceName').value.trim();
    const type   = document.getElementById('resourceType').value;
    const status = document.getElementById('resourceStatus').value;
    const editId = document.getElementById('editResourceId').value;

    if (!name || !type) { UI.toast('Nome e tipo são obrigatórios.', 'error'); return; }

    try {
      if (editId) {
        await Store.updateResource(editId, { name, type, status });
        UI.toast('Recurso atualizado!', 'success');
      } else {
        await Store.addResource({ name, type, status });
        UI.toast('Recurso cadastrado!', 'success');
      }
      document.getElementById('resourceFormCard').classList.add('hidden');
      renderGrid();
    } catch (err) {
      UI.toast('Erro ao salvar: ' + err.message, 'error');
    }
  }

  /* ---- Init ---- */
  function init() {
    document.getElementById('newResourceBtn').addEventListener('click', openNew);
    document.getElementById('resourceForm').addEventListener('submit', onFormSubmit);
    document.getElementById('cancelResource').addEventListener('click', () => {
      document.getElementById('resourceFormCard').classList.add('hidden');
    });
    document.getElementById('addTypeBtn').addEventListener('click', async () => {
      const t = prompt('Nome do novo tipo de recurso:');
      if (!t || !t.trim()) return;
      const nome = t.trim().toUpperCase();
      await Store.addResourceType(nome);
      populateTypeSelect();
      document.getElementById('resourceType').value = nome;
      UI.toast(`Tipo "${nome}" adicionado.`, 'success');
    });
  }

  function render() { renderGrid(); }

  return { init, render, openEdit, remove };
})();
