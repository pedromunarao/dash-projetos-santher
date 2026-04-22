/**
 * modules/kanban.js
 * Board Kanban: colunas por status com drag & drop entre colunas.
 * Mover um card de coluna atualiza o status da tarefa.
 *
 * Depende de: Store, UI, Dashboard (globals)
 */

const Kanban = (() => {

  let dragCardId = null;
  let dragSrcCol = null;

  /* ---- Render completo do board ---- */
  function render() {
    const board = document.getElementById('kanbanBoard');
    const tasks = Store.getTasks().sort((a, b) => a.priority - b.priority);

    board.innerHTML = STATUSES.map(s => {
      const colTasks = tasks.filter(t => t.status === s.key);
      return `
      <div class="kanban-column" data-status="${s.key}">
        <div class="kanban-col-header" style="--status-color:${s.color}">
          <span class="kanban-col-title">${s.label}</span>
          <span class="kanban-col-count">${colTasks.length}</span>
        </div>
        <div class="kanban-cards" id="kcol-${s.key}" data-status="${s.key}">
          ${colTasks.map(t => renderCard(t, s.color)).join('')}
          <div class="kanban-col-dropzone" data-status="${s.key}">Soltar aqui</div>
        </div>
      </div>`;
    }).join('');

    /* Bind de eventos de drag */
    board.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('click',     () => TaskModal.open(card.dataset.id));
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragend',   onDragEnd);
    });

    board.querySelectorAll('.kanban-cards, .kanban-col-dropzone').forEach(zone => {
      zone.addEventListener('dragover',  onDragOver);
      zone.addEventListener('dragleave', onDragLeave);
      zone.addEventListener('drop',      onDrop);
    });
  }

  /* ---- HTML de um card ---- */
  function renderCard(task, color) {
    const overdue = UI.isOverdue(task);
    return `
    <div class="kanban-card"
         style="--status-color:${color}"
         data-id="${task.id}"
         draggable="true">
      <div class="kanban-card-id">${task.id}</div>
      <div class="kanban-card-title">${escapeHtml(task.title)}</div>
      <div class="kanban-card-meta">
        <span class="kanban-card-area">${escapeHtml(task.area)}</span>
        ${overdue ? '<span class="overdue-badge">⚠ Atrasada</span>' : ''}
        <span class="resource-chip" style="font-size:0.68rem">P${task.priority}</span>
      </div>
    </div>`;
  }

  /* ---- Drag & Drop handlers ---- */
  function onDragStart(e) {
    dragCardId = e.currentTarget.dataset.id;
    dragSrcCol = e.currentTarget.closest('.kanban-cards')?.dataset.status;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragCardId);
  }

  function onDragEnd(e)   { e.currentTarget.classList.remove('dragging'); }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (e.currentTarget.classList.contains('kanban-col-dropzone')) {
      e.currentTarget.classList.add('drag-over');
    }
  }

  function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

  async function onDrop(e) {
    e.preventDefault();
    const zone      = e.currentTarget;
    const newStatus = zone.dataset.status;
    zone.classList.remove('drag-over');

    if (!dragCardId || !newStatus || newStatus === dragSrcCol) return;

    try {
      await Store.updateTask(dragCardId, { status: newStatus });
      render();
      Dashboard.render();
      UI.toast(`Status atualizado para ${getStatusLabel(newStatus)}.`, 'success');
    } catch (err) {
      UI.toast('Erro ao atualizar status: ' + err.message, 'error');
    } finally {
      dragCardId = null;
      dragSrcCol = null;
    }
  }

  return { render };
})();
