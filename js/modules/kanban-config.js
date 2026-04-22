/**
 * modules/kanban-config.js
 * Gerenciamento completo dos buckets (colunas) do Kanban.
 *
 * Funcionalidades:
 *   – Listagem dos buckets com preview visual de cor e contagem de tarefas
 *   – Criar novo bucket (nome + color picker + paleta de cores rápida)
 *   – Editar bucket inline (label + cor)
 *   – Reordenar via drag-and-drop nativo E botões ↑ / ↓
 *   – Duplicar bucket
 *   – Excluir bucket:
 *       • Sem tarefas → confirmação simples
 *       • Com tarefas → diálogo de remapeamento antes de excluir
 *   – Restaurar padrões do sistema
 *   – Estatísticas por bucket (tarefas, atrasadas, concluídas)
 *   – Preview em tempo real do board
 *
 * Depende de: Store, UI, refreshStatuses, DEFAULT_STATUSES, escapeHtml (globals)
 */

const KanbanConfig = (() => {

  let editingKey   = null;   // key do bucket em edição inline
  let dragKey      = null;   // key do bucket sendo arrastado
  let dragOverKey  = null;   // key do bucket que está sendo sobrevoado

  /* ==============================================================
     PALETA DE CORES RÁPIDAS
  ============================================================== */

  const COLOR_PRESETS = [
    '#6b7280', '#7c3aed', '#2563eb', '#0891b2',
    '#059669', '#16a34a', '#ca8a04', '#d97706',
    '#ea580c', '#dc2626', '#db2777', '#7e22ce',
    '#065f46', '#1e40af', '#166534', '#831843',
  ];

  /* ==============================================================
     UTILITÁRIOS
  ============================================================== */

  function hexToRgba(hex, alpha) {
    if (!hex || hex.length < 7) return `rgba(99,102,241,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** Calcula luminância relativa para decidir a cor do texto sobre o fundo */
  function contrastColor(hex) {
    if (!hex || hex.length < 7) return '#ffffff';
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.45 ? '#1e2536' : '#ffffff';
  }

  /** Estatísticas de um bucket */
  function bucketStats(key) {
    const tasks   = Store.getTasks();
    const mine    = tasks.filter(t => t.status === key);
    const overdue = mine.filter(t => UI.isOverdue(t));
    return { total: mine.length, overdue: overdue.length };
  }

  /* ==============================================================
     RENDER
  ============================================================== */

  function render() {
    renderPreview();
    renderStats();
    renderList();
  }

  /* ---- Preview bar (chips coloridos na ordem atual) ---- */
  function renderPreview() {
    const el = document.getElementById('kcPreviewBar');
    if (!el) return;
    const statuses = Store.getStatuses();
    el.innerHTML = statuses.map(s => {
      const { total } = bucketStats(s.key);
      return `
        <div class="kconfig-preview-col" style="background:${hexToRgba(s.color, 0.13)};border-color:${hexToRgba(s.color, 0.35)}" title="${escapeHtml(s.label)}: ${total} tarefa(s)">
          <div class="kconfig-preview-dot" style="background:${s.color}"></div>
          <span style="color:${s.color};font-weight:700;font-size:0.75rem">${escapeHtml(s.label)}</span>
          ${total > 0 ? `<span class="kconfig-preview-count" style="background:${hexToRgba(s.color, 0.2)};color:${s.color}">${total}</span>` : ''}
        </div>
      `;
    }).join('');
  }

  /* ---- Cards de estatísticas globais ---- */
  function renderStats() {
    const el = document.getElementById('kcStatsBar');
    if (!el) return;
    const statuses = Store.getStatuses();
    const tasks    = Store.getTasks();
    const overdue  = tasks.filter(t => UI.isOverdue(t));
    const done     = tasks.filter(t => {
      const s = statuses.find(st => st.key === t.status);
      return s && (t.status === 'CONCLUIDO' || t.status.includes('CONCLUI'));
    });
    el.innerHTML = `
      <div class="kconfig-stat-card">
        <div class="kconfig-stat-icon" style="background:rgba(99,102,241,0.15);color:#6366f1">🗂️</div>
        <div>
          <div class="kconfig-stat-value">${statuses.length}</div>
          <div class="kconfig-stat-label">Buckets</div>
        </div>
      </div>
      <div class="kconfig-stat-card">
        <div class="kconfig-stat-icon" style="background:rgba(16,185,129,0.15);color:#10b981">📋</div>
        <div>
          <div class="kconfig-stat-value">${tasks.length}</div>
          <div class="kconfig-stat-label">Tarefas Total</div>
        </div>
      </div>
      <div class="kconfig-stat-card">
        <div class="kconfig-stat-icon" style="background:rgba(239,68,68,0.15);color:#ef4444">⚠️</div>
        <div>
          <div class="kconfig-stat-value">${overdue.length}</div>
          <div class="kconfig-stat-label">Atrasadas</div>
        </div>
      </div>
      <div class="kconfig-stat-card">
        <div class="kconfig-stat-icon" style="background:rgba(245,158,11,0.15);color:#f59e0b">🎯</div>
        <div>
          <div class="kconfig-stat-value">${tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0}%</div>
          <div class="kconfig-stat-label">Conclusão</div>
        </div>
      </div>
    `;
  }

  /* ---- Lista principal de buckets ---- */
  function renderList() {
    const el = document.getElementById('kcBucketList');
    if (!el) return;

    const statuses = Store.getStatuses();
    const total    = statuses.length;

    if (total === 0) {
      el.innerHTML = `
        <div class="kconfig-empty">
          <div class="kconfig-empty-icon">📭</div>
          <h3>Nenhum bucket cadastrado</h3>
          <p>Clique em <strong>"+ Novo Bucket"</strong> para começar.</p>
        </div>`;
      return;
    }

    el.innerHTML = statuses.map((s, i) => {
      const isFirst = i === 0;
      const isLast  = i === total - 1;
      if (editingKey === s.key) return renderEditRow(s, i);
      return renderViewRow(s, i, isFirst, isLast);
    }).join('');

    bindRowEvents();
    bindDragEvents();
  }

  /* ---- Linha de visualização ---- */
  function renderViewRow(s, i, isFirst, isLast) {
    const { total, overdue } = bucketStats(s.key);
    const fillPct = (() => {
      const max = Math.max(...Store.getStatuses().map(st => bucketStats(st.key).total), 1);
      return total === 0 ? 0 : Math.round((total / max) * 100);
    })();

    return `
      <div class="kconfig-row ${dragKey === s.key ? 'kconfig-row--dragging' : ''} ${dragOverKey === s.key ? 'kconfig-row--dragover' : ''}"
           data-key="${s.key}"
           draggable="true">

        <!-- Drag handle -->
        <div class="kconfig-drag-handle" title="Arraste para reordenar">⠿</div>

        <!-- Índice -->
        <span class="kconfig-row-index">${i + 1}</span>

        <!-- Swatch de cor -->
        <span class="kconfig-row-swatch" style="background:${s.color};box-shadow:0 0 0 3px ${hexToRgba(s.color, 0.2)}"></span>

        <!-- Info principal -->
        <div class="kconfig-row-info">
          <span class="kconfig-row-label" style="color:${s.color}">${escapeHtml(s.label)}</span>
          <span class="kconfig-row-key">${escapeHtml(s.key)}</span>
          <!-- Barra de progresso -->
          <div class="kconfig-row-bar">
            <div class="kconfig-row-bar-fill" style="width:${fillPct}%;background:${s.color}"></div>
          </div>
        </div>

        <!-- Contagens -->
        <div class="kconfig-row-counts">
          <span class="kconfig-row-count ${total > 0 ? 'has-tasks' : ''}" style="${total > 0 ? `background:${hexToRgba(s.color, 0.12)};color:${s.color};border-color:${hexToRgba(s.color, 0.3)}` : ''}">
            ${total} tarefa${total !== 1 ? 's' : ''}
          </span>
          ${overdue > 0 ? `<span class="kconfig-row-overdue">⚠ ${overdue} atrasada${overdue !== 1 ? 's' : ''}</span>` : ''}
        </div>

        <!-- Ações -->
        <div class="kconfig-row-actions">
          <button class="kc-btn kc-btn-ghost kc-move-up"   data-key="${s.key}" ${isFirst ? 'disabled' : ''} title="Mover para cima">↑</button>
          <button class="kc-btn kc-btn-ghost kc-move-down" data-key="${s.key}" ${isLast  ? 'disabled' : ''} title="Mover para baixo">↓</button>
          <button class="kc-btn kc-btn-accent kc-edit"     data-key="${s.key}" title="Editar bucket">✏️</button>
          <button class="kc-btn kc-btn-ghost kc-duplicate" data-key="${s.key}" title="Duplicar bucket">⧉</button>
          <button class="kc-btn kc-btn-danger kc-delete"   data-key="${s.key}" title="Excluir bucket">🗑️</button>
        </div>
      </div>
    `;
  }

  /* ---- Linha de edição inline ---- */
  function renderEditRow(s, i) {
    const { total } = bucketStats(s.key);
    return `
      <div class="kconfig-row kconfig-row--editing" data-key="${s.key}">
        <div class="kconfig-drag-handle kconfig-drag-handle--disabled">⠿</div>
        <span class="kconfig-row-index">${i + 1}</span>

        <!-- Editor de cor com paleta rápida -->
        <div class="kconfig-edit-color-wrap">
          <input type="color" class="kconfig-edit-color" value="${s.color}" data-key="${s.key}" title="Escolher cor" />
        </div>

        <!-- Editor de nome + key + paleta -->
        <div class="kconfig-edit-body">
          <input type="text" class="kconfig-edit-label" value="${escapeHtml(s.label)}" data-key="${s.key}" placeholder="Nome do bucket" maxlength="30" />
          <div class="kconfig-color-presets">
            ${COLOR_PRESETS.map(c => `
              <button class="kconfig-preset-dot kc-preset" data-key="${s.key}" data-color="${c}"
                      style="background:${c}" title="${c}"></button>
            `).join('')}
          </div>
          <span class="kconfig-row-key" style="font-size:0.68rem;color:var(--text-3)">${escapeHtml(s.key)}</span>
        </div>

        <span class="kconfig-row-count ${total > 0 ? 'has-tasks' : ''}">
          ${total} tarefa${total !== 1 ? 's' : ''}
        </span>

        <div class="kconfig-row-actions">
          <button class="kc-btn kc-btn-ghost kc-cancel-edit" data-key="${s.key}">✕ Cancelar</button>
          <button class="kc-btn kc-btn-primary kc-save-edit"  data-key="${s.key}">✓ Salvar</button>
        </div>
      </div>
    `;
  }

  /* ==============================================================
     DRAG & DROP – REORDENAÇÃO
  ============================================================== */

  function bindDragEvents() {
    document.querySelectorAll('.kconfig-row[draggable="true"]').forEach(row => {
      row.addEventListener('dragstart', onRowDragStart);
      row.addEventListener('dragend',   onRowDragEnd);
      row.addEventListener('dragover',  onRowDragOver);
      row.addEventListener('dragleave', onRowDragLeave);
      row.addEventListener('drop',      onRowDrop);
    });
  }

  function onRowDragStart(e) {
    dragKey = e.currentTarget.dataset.key;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragKey);
    e.currentTarget.classList.add('kconfig-row--dragging');
    setTimeout(() => renderList(), 50);
  }

  function onRowDragEnd(e) {
    dragKey     = null;
    dragOverKey = null;
    renderList();
  }

  function onRowDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const key = e.currentTarget.dataset.key;
    if (key !== dragKey && key !== dragOverKey) {
      dragOverKey = key;
      renderList();
    }
  }

  function onRowDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      dragOverKey = null;
    }
  }

  async function onRowDrop(e) {
    e.preventDefault();
    const targetKey = e.currentTarget.dataset.key;
    if (!dragKey || !targetKey || dragKey === targetKey) {
      dragKey = null; dragOverKey = null;
      renderList();
      return;
    }

    const statuses = Store.getStatuses();
    const keys     = statuses.map(s => s.key);
    const fromIdx  = keys.indexOf(dragKey);
    const toIdx    = keys.indexOf(targetKey);

    // Remove e reinsere na posição destino
    keys.splice(fromIdx, 1);
    keys.splice(toIdx, 0, dragKey);

    await Store.reorderStatuses(keys);
    refreshStatuses();

    dragKey     = null;
    dragOverKey = null;
    render();
    UI.toast('Bucket reordenado!', 'success');
  }

  /* ==============================================================
     BIND EVENTS – chamado após cada renderList()
  ============================================================== */

  function bindRowEvents() {
    /* Edit */
    document.querySelectorAll('.kc-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        editingKey = btn.dataset.key;
        renderList();
        setTimeout(() => {
          document.querySelector(`.kconfig-edit-label[data-key="${editingKey}"]`)?.focus();
        }, 50);
      });
    });

    /* Cancel edit */
    document.querySelectorAll('.kc-cancel-edit').forEach(btn => {
      btn.addEventListener('click', () => { editingKey = null; renderList(); });
    });

    /* Save edit */
    document.querySelectorAll('.kc-save-edit').forEach(btn => {
      btn.addEventListener('click', () => saveEdit(btn.dataset.key));
    });

    /* Paleta rápida de cores */
    document.querySelectorAll('.kc-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const colorEl = document.querySelector(`.kconfig-edit-color[data-key="${btn.dataset.key}"]`);
        if (colorEl) {
          colorEl.value = btn.dataset.color;
          // feedback visual
          document.querySelectorAll(`.kc-preset[data-key="${btn.dataset.key}"]`).forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    /* Enter/Esc no campo de edição */
    document.querySelectorAll('.kconfig-edit-label').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  saveEdit(input.dataset.key);
        if (e.key === 'Escape') document.querySelector(`.kc-cancel-edit[data-key="${input.dataset.key}"]`)?.click();
      });
    });

    /* Move up */
    document.querySelectorAll('.kc-move-up').forEach(btn => {
      btn.addEventListener('click', () => moveStatus(btn.dataset.key, -1));
    });

    /* Move down */
    document.querySelectorAll('.kc-move-down').forEach(btn => {
      btn.addEventListener('click', () => moveStatus(btn.dataset.key, +1));
    });

    /* Duplicate */
    document.querySelectorAll('.kc-duplicate').forEach(btn => {
      btn.addEventListener('click', () => duplicateBucket(btn.dataset.key));
    });

    /* Delete */
    document.querySelectorAll('.kc-delete').forEach(btn => {
      btn.addEventListener('click', () => handleDelete(btn.dataset.key));
    });
  }

  /* ==============================================================
     ACTIONS
  ============================================================== */

  async function saveEdit(key) {
    const labelEl = document.querySelector(`.kconfig-edit-label[data-key="${key}"]`);
    const colorEl = document.querySelector(`.kconfig-edit-color[data-key="${key}"]`);
    const label   = (labelEl?.value || '').trim().toUpperCase();
    const color   = colorEl?.value || '#6b7280';

    if (!label) { UI.toast('O nome do bucket não pode estar vazio.', 'error'); labelEl?.focus(); return; }
    if (label.length < 2) { UI.toast('O nome deve ter pelo menos 2 caracteres.', 'error'); return; }

    try {
      await Store.updateStatus(key, { label, color });
      refreshStatuses();
      editingKey = null;
      render();
      UI.toast('Bucket atualizado com sucesso!', 'success');
      if (!document.getElementById('page-kanban').classList.contains('hidden')) Kanban.render();
    } catch (err) {
      UI.toast('Erro ao salvar: ' + err.message, 'error');
    }
  }

  /* Reordenação por botões */
  async function moveStatus(key, direction) {
    const statuses = Store.getStatuses();
    const idx      = statuses.findIndex(s => s.key === key);
    const newIdx   = idx + direction;
    if (newIdx < 0 || newIdx >= statuses.length) return;

    const keys = statuses.map(s => s.key);
    [keys[idx], keys[newIdx]] = [keys[newIdx], keys[idx]];
    await Store.reorderStatuses(keys);
    refreshStatuses();
    render();
  }

  /* Duplicar bucket */
  async function duplicateBucket(key) {
    const s = Store.getStatuses().find(st => st.key === key);
    if (!s) return;
    await Store.addStatus({ label: s.label + ' (CÓPIA)', color: s.color });
    refreshStatuses();
    render();
    UI.toast(`Bucket "${s.label}" duplicado!`, 'success');
  }

  /* Exclusão com verificação de tarefas vinculadas */
  async function handleDelete(key) {
    const statuses = Store.getStatuses();
    if (statuses.length <= 1) {
      UI.toast('É necessário manter pelo menos 1 bucket.', 'error');
      return;
    }

    const tasks  = Store.getTasks();
    const linked = tasks.filter(t => t.status === key);

    if (linked.length > 0) {
      openRemapDialog(key, linked.length);
    } else {
      const s  = statuses.find(s => s.key === key);
      const ok = await UI.confirm(
        'Excluir Bucket',
        `Deseja excluir o bucket "${s?.label}"? Esta ação não pode ser desfeita.`
      );
      if (ok) {
        try {
          await Store.deleteStatus(key);
          refreshStatuses();
          render();
          UI.toast('Bucket excluído.', 'info');
        } catch (err) {
          UI.toast('Erro ao excluir: ' + err.message, 'error');
        }
      }
    }
  }

  /* Criar novo bucket */
  async function createBucket() {
    const labelEl = document.getElementById('kcNewLabel');
    const colorEl = document.getElementById('kcNewColor');
    const label   = (labelEl?.value || '').trim();

    if (!label)           { UI.toast('Informe um nome para o bucket.', 'error'); labelEl?.focus(); return; }
    if (label.length < 2) { UI.toast('O nome deve ter pelo menos 2 caracteres.', 'error'); return; }

    // Verifica nome duplicado (case insensitive)
    const dup = Store.getStatuses().find(s => s.label.toLowerCase() === label.toLowerCase());
    if (dup) { UI.toast(`Já existe um bucket com o nome "${dup.label}".`, 'error'); return; }

    try {
      await Store.addStatus({ label: label.toUpperCase(), color: colorEl?.value || '#6366f1' });
      refreshStatuses();
      render();
      closeNewForm();
      UI.toast(`Bucket "${label.toUpperCase()}" criado!`, 'success');
    } catch (err) {
      UI.toast('Erro ao criar bucket: ' + err.message, 'error');
    }
  }

  function closeNewForm() {
    document.getElementById('kcNewForm')?.classList.add('hidden');
    const lbl = document.getElementById('kcNewLabel');
    const clr = document.getElementById('kcNewColor');
    if (lbl) lbl.value = '';
    if (clr) clr.value = '#6366f1';
    // Reset paleta
    document.querySelectorAll('.kc-new-preset').forEach(b => b.classList.remove('active'));
  }

  /* ==============================================================
     REMAP DIALOG – excluir bucket com tarefas vinculadas
  ============================================================== */

  function openRemapDialog(deleteKey, count) {
    const others  = Store.getStatuses().filter(s => s.key !== deleteKey);
    const overlay = document.getElementById('kcRemapOverlay');
    const msg     = document.getElementById('kcRemapMessage');
    const select  = document.getElementById('kcRemapTarget');

    msg.textContent  = `Este bucket possui ${count} tarefa(s) vinculada(s). Antes de excluir, mova-as para outro bucket:`;
    select.innerHTML = others.map(s => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join('');
    overlay.dataset.deleteKey = deleteKey;
    overlay.classList.remove('hidden');
  }

  function closeRemapDialog() {
    document.getElementById('kcRemapOverlay')?.classList.add('hidden');
  }

  async function confirmRemap() {
    const overlay   = document.getElementById('kcRemapOverlay');
    const deleteKey = overlay.dataset.deleteKey;
    const targetKey = document.getElementById('kcRemapTarget')?.value;

    if (!deleteKey || !targetKey) return;

    try {
      const toRemap = Store.getTasks().filter(t => t.status === deleteKey);
      await Promise.all(toRemap.map(t => Store.updateTask(t.id, { status: targetKey })));
      await Store.deleteStatus(deleteKey);
      refreshStatuses();
      closeRemapDialog();
      render();
      UI.toast('Tarefas remapeadas e bucket excluído!', 'success');
    } catch (err) {
      UI.toast('Erro ao remapear: ' + err.message, 'error');
    }
  }

  /* ==============================================================
     INIT
  ============================================================== */

  function init() {
    /* Abrir formulário de novo bucket */
    document.getElementById('kcAddBtn')?.addEventListener('click', () => {
      document.getElementById('kcNewForm')?.classList.remove('hidden');
      document.getElementById('kcNewLabel')?.focus();
    });

    /* Cancelar novo bucket (header X e footer) */
    document.getElementById('kcNewCancelBtn')?.addEventListener('click', closeNewForm);
    document.getElementById('kcNewCancelBtnFooter')?.addEventListener('click', closeNewForm);

    /* Salvar novo bucket */
    document.getElementById('kcNewSaveBtn')?.addEventListener('click', createBucket);

    /* Enter/Esc no input de novo bucket */
    document.getElementById('kcNewLabel')?.addEventListener('keydown', e => {
      if (e.key === 'Enter')  createBucket();
      if (e.key === 'Escape') closeNewForm();
    });

    /* Paleta de cores no formulário de novo bucket */
    document.querySelectorAll('.kc-new-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const colorEl = document.getElementById('kcNewColor');
        if (colorEl) colorEl.value = btn.dataset.color;
        document.querySelectorAll('.kc-new-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    /* Restaurar padrões */
    document.getElementById('kcRestoreBtn')?.addEventListener('click', async () => {
      const ok = await UI.confirm(
        'Restaurar Padrões',
        'Isso irá substituir todos os buckets pelos valores padrão do sistema. Tarefas com buckets personalizados serão mantidas, mas poderão ficar sem status correspondente. Deseja continuar?'
      );
      if (!ok) return;
      Store.saveStatuses([...DEFAULT_STATUSES]);
      refreshStatuses();
      render();
      UI.toast('Buckets restaurados para o padrão do sistema.', 'info');
    });

    /* Remap dialog: cancelar */
    document.getElementById('kcRemapCancelBtn')?.addEventListener('click', closeRemapDialog);

    /* Remap dialog: confirmar */
    document.getElementById('kcRemapConfirmBtn')?.addEventListener('click', confirmRemap);

    /* Fechar remap clicando no overlay */
    document.getElementById('kcRemapOverlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeRemapDialog();
    });
  }

  return { init, render };
})();
