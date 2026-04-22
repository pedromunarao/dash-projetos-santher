/**
 * modules/dashboard.js
 * Renderização do Dashboard: métricas, filtros, lista de tarefas e
 * modal de detalhe, com drag & drop para reordenação de prioridade.
 *
 * Depende de: Store, UI, Kanban, TaskForm, App (globals)
 */

/* ============================================================
   DASHBOARD
============================================================ */
const Dashboard = (() => {

  let dragSrcId = null;
  let chartStatusInstance = null;
  let chartAreaInstance = null;

  /* ---- Gráficos (Chart.js) ---- */
  function renderCharts() {
    const tasks = Store.getTasks();
    if (!window.Chart) return;

    // Status Chart
    const statusCounts = {};
    STATUSES.forEach(s => statusCounts[s.key] = 0);
    tasks.forEach(t => { if (statusCounts[t.status] !== undefined) statusCounts[t.status]++; });

    const ctxStatus = document.getElementById('chartStatus');
    if (ctxStatus && ctxStatus.offsetParent !== null) {
      if (chartStatusInstance) chartStatusInstance.destroy();
      chartStatusInstance = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
          labels: STATUSES.map(s => s.label),
          datasets: [{
            data: STATUSES.map(s => statusCounts[s.key]),
            backgroundColor: STATUSES.map(s => getStatusByKey(s.key).color),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim() } } },
          cutout: '70%'
        }
      });
    }

    // Area Chart
    const areaCounts = {};
    tasks.forEach(t => { 
      const a = t.area || 'Outros';
      areaCounts[a] = (areaCounts[a] || 0) + 1;
    });
    const areaLabels = Object.keys(areaCounts);
    const areaData = Object.values(areaCounts);

    const ctxArea = document.getElementById('chartArea');
    if (ctxArea && ctxArea.offsetParent !== null) {
      if (chartAreaInstance) chartAreaInstance.destroy();
      chartAreaInstance = new Chart(ctxArea, {
        type: 'bar',
        data: {
          labels: areaLabels,
          datasets: [{
            label: 'Tarefas',
            data: areaData,
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
            y: { ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(148, 163, 184, 0.1)' } }
          }
        }
      });
    }
  }

  /* ---- Métricas ---- */
  function renderMetrics() {
    const tasks     = Store.getTasks();
    const resources = Store.getResources();
    const now       = new Date();
    const month     = now.getMonth();
    const year      = now.getFullYear();

    const total      = tasks.length;
    const overdue    = tasks.filter(t => UI.isOverdue(t)).length;
    const doneMonth  = tasks.filter(t => {
      if (t.status !== 'CONCLUIDO' || !t.closedAt) return false;
      const d = new Date(t.closedAt);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;
    const inProgress = tasks.filter(t => t.status !== 'CONCLUIDO' && t.status !== 'PENDENTE').length;
    const busy       = resources.filter(r => r.status === 'OCUPADO').length;
    const avail      = resources.filter(r => r.status === 'DISPONIVEL').length;

    const cards = [
      { label: 'Total de Tarefas',     value: total,     sub: `${inProgress} em andamento`,  color: '#6366f1' },
      { label: 'Em Atraso',            value: overdue,   sub: 'prazo ultrapassado',           color: overdue > 0 ? '#ef4444' : '#22c55e' },
      { label: 'Concluídas no Mês',    value: doneMonth, sub: `de ${total} no total`,         color: '#22c55e' },
      { label: 'Recursos Disponíveis', value: avail,     sub: `${busy} ocupados`,             color: '#0d9488' },
    ];

    document.getElementById('metricsGrid').innerHTML = cards.map(c => `
      <div class="metric-card" style="--m-color:${c.color}">
        <div class="metric-label">${c.label}</div>
        <div class="metric-value">${c.value}</div>
        <div class="metric-sub">${c.sub}</div>
      </div>
    `).join('');
  }

  /* ---- Filtros ---- */
  function populateFilters() {
    const tasks = Store.getTasks();

    const fStatus = document.getElementById('filterStatus');
    const curStatus = fStatus.value;
    fStatus.innerHTML = '<option value="">Todos os Status</option>' +
      STATUSES.map(s => `<option value="${s.key}" ${curStatus === s.key ? 'selected' : ''}>${s.label}</option>`).join('');

    const fArea = document.getElementById('filterArea');
    const curArea = fArea.value;
    const areas = [...new Set(tasks.map(t => t.area).filter(Boolean))].sort();
    fArea.innerHTML = '<option value="">Todas as Áreas</option>' +
      areas.map(a => `<option value="${a}" ${curArea === a ? 'selected' : ''}>${a}</option>`).join('');

    const fRes = document.getElementById('filterResource');
    const curRes = fRes.value;
    const allRes = [...new Set(tasks.flatMap(t => t.resources || []))].sort();
    fRes.innerHTML = '<option value="">Todos os Recursos</option>' +
      allRes.map(r => `<option value="${r}" ${curRes === r ? 'selected' : ''}>${r}</option>`).join('');

    const fSol = document.getElementById('filterSolicitor');
    const curSol = fSol.value;
    const solicitors = [...new Set(tasks.map(t => t.solicitor).filter(Boolean))].sort();
    fSol.innerHTML = '<option value="">Todos os Solicitantes</option>' +
      solicitors.map(s => `<option value="${s}" ${curSol === s ? 'selected' : ''}>${s}</option>`).join('');
  }

  /* ---- Filtragem + ordenação ---- */
  function getFilteredTasks() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const status = document.getElementById('filterStatus').value;
    const area   = document.getElementById('filterArea').value;
    const res    = document.getElementById('filterResource').value;
    const sol    = document.getElementById('filterSolicitor').value;

    return Store.getTasks()
      .filter(t => {
        if (search && !t.title.toLowerCase().includes(search) && !t.id.toLowerCase().includes(search)) return false;
        if (status && t.status  !== status)              return false;
        if (area   && t.area    !== area)                return false;
        if (res    && !(t.resources || []).includes(res)) return false;
        if (sol    && t.solicitor !== sol)               return false;
        return true;
      })
      .sort((a, b) => a.priority - b.priority);
  }

  /* ---- Card HTML ---- */
  function renderCard(task) {
    const color     = getStatusByKey(task.status).color;
    const overdue   = UI.isOverdue(task);
    const resources = task.resources || [];
    const dueStr    = task.dueDate ? UI.formatDateForDisplay(task.dueDate) : '—';

    return `
    <div class="task-card"
         style="--status-color:${color}"
         data-id="${task.id}"
         draggable="true"
         id="card-${task.id}">
      <div class="task-priority-badge">
        <span style="font-size:0.6rem;color:var(--text-3)">PRIO</span>
        <span class="priority-num">${task.priority}</span>
      </div>

      <div class="task-info">
        <div class="task-card-top">
          <span class="task-card-id">${task.id}</span>
          <span class="task-card-title">${escapeHtml(task.title)}</span>
          ${overdue ? '<span class="overdue-badge">⚠ Atrasada</span>' : ''}
        </div>
        <div class="task-card-meta">
          <span class="task-meta-item"><span class="meta-icon">🏢</span>${escapeHtml(task.area)}</span>
          <span class="task-meta-item"><span class="meta-icon">👤</span>${escapeHtml(task.solicitor)}</span>
          <span class="task-meta-item"><span class="meta-icon">📅</span>${dueStr}</span>
        </div>
      </div>

      <div class="task-card-right">
        ${UI.statusBadge(task.status)}
        <div class="resource-chips">
          ${resources.slice(0, 3).map(r => `<span class="resource-chip">${escapeHtml(r)}</span>`).join('')}
          ${resources.length > 3 ? `<span class="resource-chip">+${resources.length - 3}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  /* ---- Lista ---- */
  function renderList() {
    const tasks = getFilteredTasks();
    const list  = document.getElementById('taskList');
    const empty = document.getElementById('emptyState');

    if (tasks.length === 0) {
      list.innerHTML = '';
      list.appendChild(empty);
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    list.innerHTML = tasks.map(renderCard).join('');

    list.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click',     () => TaskModal.open(card.dataset.id));
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragover',  onDragOver);
      card.addEventListener('dragleave', onDragLeave);
      card.addEventListener('drop',      onDrop);
      card.addEventListener('dragend',   onDragEnd);
    });
  }

  /* ---- Drag & drop (reordenação de prioridade) ---- */
  function onDragStart(e) {
    dragSrcId = e.currentTarget.dataset.id;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcId);
  }
  function onDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); e.dataTransfer.dropEffect = 'move'; }
  function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
  function onDragEnd(e)   { e.currentTarget.classList.remove('dragging'); }

  async function onDrop(e) {
    e.preventDefault();
    const targetId = e.currentTarget.dataset.id;
    e.currentTarget.classList.remove('drag-over');
    if (!dragSrcId || dragSrcId === targetId) return;

    const src    = Store.getTask(dragSrcId);
    const target = Store.getTask(targetId);
    if (!src || !target) return;

    await Promise.all([
      Store.updateTask(dragSrcId, { priority: target.priority }),
      Store.updateTask(targetId,  { priority: src.priority    }),
    ]);
    render();
    Kanban.render();
  }

  /* ---- Render geral ---- */
  function render() {
    renderMetrics();
    renderCharts();
    populateFilters();
    renderList();
  }

  /* ---- Init ---- */
  function init() {
    const filterIds = ['searchInput', 'filterStatus', 'filterArea', 'filterResource', 'filterSolicitor'];
    filterIds.forEach(id => {
      const el  = document.getElementById(id);
      const evt = id === 'searchInput' ? 'input' : 'change';
      el.addEventListener(evt, render);
    });

    document.getElementById('clearFilters').addEventListener('click', () => {
      document.getElementById('searchInput').value      = '';
      document.getElementById('filterStatus').value     = '';
      document.getElementById('filterArea').value       = '';
      document.getElementById('filterResource').value   = '';
      document.getElementById('filterSolicitor').value  = '';
      render();
    });

    document.querySelector('#emptyState [data-page]')
      ?.addEventListener('click', e => App.navigate(e.currentTarget.dataset.page));
  }

  return { init, render };
})();

/* ============================================================
   Utilitário de escape HTML (global)
============================================================ */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/* ============================================================
   TASK MODAL
============================================================ */
const TaskModal = (() => {

  function open(id) {
    const task = Store.getTask(id);
    if (!task) return;

    const overdue   = UI.isOverdue(task);
    const resources = (task.resources || []).join(', ') || '—';

    document.getElementById('modalTaskId').textContent = task.id;
    document.getElementById('modalTitle').textContent  = task.title;
    document.getElementById('taskModal').classList.remove('hidden');

    document.getElementById('modalBody').innerHTML = `
      <div class="modal-section">
        <div class="modal-fields">
          <div class="modal-field">
            <span class="modal-field-label">Status</span>
            <span class="modal-field-value">${UI.statusBadge(task.status)}</span>
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Prioridade</span>
            <span class="modal-field-value" style="font-size:1.2rem;font-weight:800">${task.priority}</span>
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Área Solicitante</span>
            <span class="modal-field-value">${escapeHtml(task.area)}</span>
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Solicitante</span>
            <span class="modal-field-value">${escapeHtml(task.solicitor)}</span>
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Recursos Alocados</span>
            <span class="modal-field-value">${escapeHtml(resources)}</span>
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Data de Abertura</span>
            <span class="modal-field-value">${UI.formatDateTime(task.openedAt)}</span>
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Data Prevista</span>
            <span class="modal-field-value" style="${overdue ? 'color:var(--danger);font-weight:700' : ''}">
              ${task.dueDate ? UI.formatDateForDisplay(task.dueDate) : '—'}
              ${overdue ? ' ⚠' : ''}
            </span>
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Data de Conclusão</span>
            <span class="modal-field-value">${UI.formatDateTime(task.closedAt)}</span>
          </div>
        </div>
      </div>

      ${task.description ? `
      <div class="modal-section">
        <div class="modal-section-title">Descrição</div>
        <p class="modal-description">${escapeHtml(task.description)}</p>
      </div>` : ''}

      ${task.notes ? `
      <div class="modal-section">
        <div class="modal-section-title">Observações</div>
        <p class="modal-description">${escapeHtml(task.notes)}</p>
      </div>` : ''}

      <div class="modal-section">
        <div class="modal-section-title">Histórico de Alterações</div>
        <div class="history-log">
          ${(task.history || []).slice().reverse().map(h => `
            <div class="history-entry">
              <div class="history-dot"></div>
              <span class="history-time">${UI.formatDateTime(h.time)}</span>
              <span class="history-text">${escapeHtml(h.text)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('modalEditBtn').onclick = () => { close(); TaskForm.openEdit(id); };
    document.getElementById('modalDeleteBtn').onclick = async () => {
      const ok = await UI.confirm('Excluir Tarefa', `Deseja excluir "${task.title}"? Esta ação não pode ser desfeita.`);
      if (ok) {
        try {
          await Store.deleteTask(id);
          close();
          try { Dashboard.render(); } catch (e) { console.error('Dashboard render falhou:', e); }
          try { Kanban.render(); } catch (e) { console.error('Kanban render falhou:', e); }
          UI.toast('Tarefa excluída.', 'info');
        } catch(err) {
          UI.toast('Erro ao excluir: ' + err.message, 'error');
        }
      }
    };
  }

  function close() {
    document.getElementById('taskModal').classList.add('hidden');
  }

  function init() {
    document.getElementById('modalClose').addEventListener('click', close);
    document.getElementById('taskModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) close();
    });
  }

  return { init, open, close };
})();
