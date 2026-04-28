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
  let chartTypeInstance = null;

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

    // Type Chart (Sistemas vs Infraestrutura)
    const sistCount  = tasks.filter(t => (t.projectType || 'SISTEMAS') === 'SISTEMAS').length;
    const infraCount = tasks.filter(t => t.projectType === 'INFRAESTRUTURA').length;

    const ctxType = document.getElementById('chartType');
    if (ctxType && ctxType.offsetParent !== null) {
      if (chartTypeInstance) chartTypeInstance.destroy();
      chartTypeInstance = new Chart(ctxType, {
        type: 'doughnut',
        data: {
          labels: ['Sistemas', 'Infraestrutura'],
          datasets: [{
            data: [sistCount, infraCount],
            backgroundColor: ['rgba(99,102,241,0.8)', 'rgba(249,115,22,0.8)'],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim() }
            }
          },
          cutout: '65%',
        },
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
      { label: 'Projetos de Sistemas',       value: tasks.filter(t => (t.projectType || 'SISTEMAS') === 'SISTEMAS').length,        sub: 'tipo sistemas',       color: '#6366f1' },
      { label: 'Projetos de Infraestrutura', value: tasks.filter(t => t.projectType === 'INFRAESTRUTURA').length, sub: 'tipo infraestrutura',  color: '#f97316' },
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
    const ptype  = document.getElementById('filterProjectType').value;

    return Store.getTasks()
      .filter(t => {
        if (search && !t.title.toLowerCase().includes(search) && !t.id.toLowerCase().includes(search)) return false;
        if (status && t.status  !== status)              return false;
        if (area   && t.area    !== area)                return false;
        if (res    && !(t.resources || []).includes(res)) return false;
        if (sol    && t.solicitor !== sol)               return false;
        if (ptype  && (t.projectType || 'SISTEMAS') !== ptype) return false;
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
          ${projectTypeBadge(task.projectType || 'SISTEMAS')}
          ${task.isCritical ? '<span class="critical-badge" style="background:var(--danger); color:#fff; padding:2px 6px; border-radius:4px; font-size:0.65rem; font-weight:700;">⚡ CRÍTICA</span>' : ''}
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

    if (!list) return; // página dashboard não está visível

    if (tasks.length === 0) {
      list.innerHTML = '';
      if (empty) {
        list.appendChild(empty);
        empty.style.display = 'block';
      }
      return;
    }

    if (empty) empty.style.display = 'none';
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
    const filterIds = ['searchInput', 'filterStatus', 'filterArea', 'filterResource', 'filterSolicitor', 'filterProjectType'];
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
      document.getElementById('filterProjectType').value = '';
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
   Badge de tipo de projeto (global – usado por Dashboard e TaskModal)
============================================================ */
function projectTypeBadge(type) {
  if (type === 'INFRAESTRUTURA') {
    return '<span class="project-type-badge pt-infra">🔧 Infraestrutura</span>';
  }
  return '<span class="project-type-badge pt-sistemas">💻 Sistemas</span>';
}

/* ============================================================
   TASK MODAL
============================================================ */
const TaskModal = (() => {

  let _taskId = null; // id da tarefa aberta atualmente

  /* ---- helpers de save inline ---- */
  async function _patch(data) {
    try {
      const updated = await Store.updateTask(_taskId, data);
      // atualiza cache para próximas aberturas
      return updated;
    } catch(e) {
      UI.toast('Erro ao salvar: ' + e.message, 'error');
    }
  }

  /* ---- barra de progresso ---- */
  function _renderProgress(task) {
    const pct = task.progress || 0;
    return `
    <div class="modal-section">
      <div class="modal-section-title">📊 Progresso da Tarefa</div>
      <div class="task-progress-wrap">
        <div class="task-progress-bar-track">
          <div class="task-progress-bar-fill" id="modalProgressFill" style="width:${pct}%"></div>
        </div>
        <span class="task-progress-pct" id="modalProgressPct">${pct}%</span>
      </div>
      <input type="range" min="0" max="100" value="${pct}"
             class="task-progress-slider" id="modalProgressSlider" />
    </div>`;
  }

  /* ---- checklist ---- */
  function _renderChecklist(task) {
    const items = task.checklist || [];
    const done  = items.filter(i => i.done).length;
    return `
    <div class="modal-section">
      <div class="modal-section-title">✅ Checklist (${done}/${items.length})</div>
      <div class="checklist-list" id="modalChecklist">
        ${items.map((item, idx) => `
        <div class="checklist-item" data-idx="${idx}">
          <label class="checklist-label ${item.done ? 'done' : ''}">
            <input type="checkbox" class="checklist-cb" data-idx="${idx}" ${item.done ? 'checked' : ''} />
            <span class="checklist-text">${escapeHtml(item.text)}</span>
          </label>
          <button class="checklist-remove" data-idx="${idx}" title="Remover">✕</button>
        </div>`).join('')}
      </div>
      <div class="checklist-add-row">
        <input type="text" id="modalChecklistInput" placeholder="Novo item..." class="checklist-input" maxlength="120" />
        <button class="btn btn-ghost btn-sm" id="modalChecklistAdd">+ Adicionar</button>
      </div>
    </div>`;
  }

  /* ---- comentários ---- */
  function _renderComments(task) {
    const comments = [...(task.comments || [])].reverse();
    return `
    <div class="modal-section">
      <div class="modal-section-title">💬 Comentários (${task.comments?.length || 0})</div>
      <div class="comments-add-row">
        <textarea id="modalCommentInput" placeholder="Escreva um comentário..." class="comment-input" rows="2" maxlength="500"></textarea>
        <button class="btn btn-primary btn-sm" id="modalCommentAdd">Comentar</button>
      </div>
      <div class="comments-list" id="modalCommentsList">
        ${comments.map((c, i) => {
          const originalIndex = task.comments.length - 1 - i;
          return `
        <div class="comment-entry" style="position: relative;">
          <div class="comment-meta">
            <span class="comment-icon">💬</span>
            <span class="comment-author" style="font-weight: 600; margin-right: 8px;">${escapeHtml(c.user || 'Usuário')}</span>
            <span class="comment-time">${UI.formatDateTime(c.time)}</span>
          </div>
          <div class="comment-text">${escapeHtml(c.text)}</div>
          <button class="comment-delete-btn btn btn-ghost btn-sm" style="color: var(--danger); font-size: 0.8rem; padding: 2px 4px; position: absolute; right: 8px; top: 8px;" data-idx="${originalIndex}" title="Excluir">✕</button>
        </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  /* ---- bind eventos interativos ---- */
  function _bindInteractive(task) {

    // -- PROGRESSO --
    const slider = document.getElementById('modalProgressSlider');
    const fill   = document.getElementById('modalProgressFill');
    const pctEl  = document.getElementById('modalProgressPct');
    if (slider) {
      slider.addEventListener('input', () => {
        const v = slider.value;
        fill.style.width = v + '%';
        pctEl.textContent = v + '%';
      });
      slider.addEventListener('change', async () => {
        await _patch({ progress: Number(slider.value) });
      });
    }

    // -- CHECKLIST --
    const chkList = document.getElementById('modalChecklist');
    if (chkList) {
      // marcar/desmarcar
      chkList.querySelectorAll('.checklist-cb').forEach(cb => {
        cb.addEventListener('change', async () => {
          const idx = Number(cb.dataset.idx);
          const task = Store.getTask(_taskId);
          const cl = [...(task.checklist || [])];
          cl[idx] = { ...cl[idx], done: cb.checked };
          cb.closest('.checklist-label').classList.toggle('done', cb.checked);
          // atualiza contador
          const allItems = chkList.querySelectorAll('.checklist-cb');
          const doneCount = [...allItems].filter(c => c.checked).length;
          document.querySelector('#modalChecklist')?.closest('.modal-section')
            ?.querySelector('.modal-section-title')
            ?.textContent && (document.querySelector('#modalChecklist').closest('.modal-section').querySelector('.modal-section-title').textContent = `✅ Checklist (${doneCount}/${allItems.length})`);
          await _patch({ checklist: cl });
        });
      });

      // remover item
      chkList.querySelectorAll('.checklist-remove').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.dataset.idx);
          const task = Store.getTask(_taskId);
          const cl = [...(task.checklist || [])];
          cl.splice(idx, 1);
          await _patch({ checklist: cl });
          open(_taskId); // re-render modal
        });
      });
    }

    // -- ADICIONAR ITEM CHECKLIST --
    const addCheckBtn = document.getElementById('modalChecklistAdd');
    const checkInput  = document.getElementById('modalChecklistInput');
    if (addCheckBtn && checkInput) {
      const addItem = async () => {
        const text = checkInput.value.trim();
        if (!text) return;
        const task = Store.getTask(_taskId);
        const cl = [...(task.checklist || []), { text, done: false }];
        await _patch({ checklist: cl });
        open(_taskId);
      };
      addCheckBtn.addEventListener('click', addItem);
      checkInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
    }

    // -- ADICIONAR COMENTÁRIO --
    const addCmtBtn  = document.getElementById('modalCommentAdd');
    const cmtInput   = document.getElementById('modalCommentInput');
    if (addCmtBtn && cmtInput) {
      const addComment = async () => {
        const text = cmtInput.value.trim();
        if (!text) return;
        const task = Store.getTask(_taskId);
        const currentUser = Auth.getCurrentUser();
        const username = currentUser ? currentUser.username : 'Usuário';
        const comments = [...(task.comments || []), { text, user: username, time: new Date().toISOString() }];
        await _patch({ comments });
        open(_taskId);
      };
      addCmtBtn.addEventListener('click', addComment);
      cmtInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } });
    }

    // -- EXCLUIR COMENTÁRIO --
    document.querySelectorAll('.comment-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.idx);
        const task = Store.getTask(_taskId);
        const comments = [...(task.comments || [])];
        comments.splice(idx, 1);
        await _patch({ comments });
        open(_taskId);
      });
    });
  }

  function open(id) {
    _taskId = id;
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
            <span class="modal-field-label">Tipo de Projeto</span>
            <span class="modal-field-value">${projectTypeBadge(task.projectType || 'SISTEMAS')}</span>
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Prioridade</span>
            <span class="modal-field-value" style="font-size:1.2rem;font-weight:800; display:flex; align-items:center; gap:8px;">
              ${task.priority}
              ${task.isCritical ? '<span style="background:var(--danger); color:#fff; padding:2px 6px; border-radius:4px; font-size:0.7rem;">⚡ CRÍTICA</span>' : ''}
            </span>
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

      ${_renderProgress(task)}
      ${_renderChecklist(task)}
      ${_renderComments(task)}

      <div class="modal-section">
        <details class="history-details">
          <summary class="modal-section-title" style="cursor: pointer; user-select: none;">
            Histórico de Alterações (${task.history?.length || 0})
            <span style="font-size: 0.8em; opacity: 0.7; font-weight: normal; margin-left: 8px;">(Clique para expandir)</span>
          </summary>
          <div class="history-log" style="margin-top: 12px;">
            ${(task.history || []).slice().reverse().map(h => `
              <div class="history-entry">
                <div class="history-dot"></div>
                <span class="history-time">${UI.formatDateTime(h.time)}</span>
                <span class="history-text">${escapeHtml(h.text)}</span>
              </div>
            `).join('')}
          </div>
        </details>
      </div>
    `;

    _bindInteractive(task);

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
    _taskId = null;
  }

  function init() {
    document.getElementById('modalClose').addEventListener('click', close);
    document.getElementById('taskModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) close();
    });
  }

  return { init, open, close };
})();

