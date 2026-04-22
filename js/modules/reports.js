/**
 * modules/reports.js
 * Página de relatórios: gráficos de barra, tabelas e exportação CSV.
 *
 * Depende de: Store, UI (globals)
 */

const Reports = (() => {

  /* ---- Renderiza todos os relatórios ---- */
  function render() {
    const tasks     = Store.getTasks();
    const resources = Store.getResources();
    const now       = new Date();
    const month     = now.getMonth();
    const year      = now.getFullYear();

    /* Dados agregados */
    const byStatus = STATUSES.map(s => ({
      label: s.label,
      color: s.color,
      count: tasks.filter(t => t.status === s.key).length,
    }));
    const maxStatus = Math.max(...byStatus.map(b => b.count), 1);

    const byArea = AREAS
      .map(a => ({ label: a, count: tasks.filter(t => t.area === a).length }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count);
    const maxArea = Math.max(...byArea.map(b => b.count), 1);

    const overdueTasks = tasks.filter(t => UI.isOverdue(t)).sort((a, b) => a.priority - b.priority);

    const doneTasks = tasks.filter(t => {
      if (t.status !== 'CONCLUIDO' || !t.closedAt) return false;
      const d = new Date(t.closedAt);
      return d.getMonth() === month && d.getFullYear() === year;
    });

    const resOverview = resources.map(r => ({ ...r, active: UI.getTasksForResource(r.name).length }));

    document.getElementById('reportsContent').innerHTML = `
      <!-- Tarefas por Status -->
      <div class="report-card">
        <h3>📊 Tarefas por Status</h3>
        <div class="bar-chart">
          ${byStatus.map(b => `
          <div class="bar-row">
            <span class="bar-label" title="${b.label}">${b.label}</span>
            <div class="bar-track">
              <div class="bar-fill" style="width:${(b.count / maxStatus * 100).toFixed(1)}%;background:${b.color}"></div>
            </div>
            <span class="bar-count">${b.count}</span>
          </div>`).join('')}
        </div>
      </div>

      <!-- Tarefas por Área -->
      <div class="report-card">
        <h3>🏢 Tarefas por Área</h3>
        ${byArea.length === 0
          ? '<p style="color:var(--text-3)">Nenhum dado ainda.</p>'
          : `<div class="bar-chart">
            ${byArea.map(b => `
            <div class="bar-row">
              <span class="bar-label">${b.label}</span>
              <div class="bar-track">
                <div class="bar-fill" style="width:${(b.count / maxArea * 100).toFixed(1)}%;background:var(--accent)"></div>
              </div>
              <span class="bar-count">${b.count}</span>
            </div>`).join('')}
          </div>`}
      </div>

      <!-- Tarefas em Atraso -->
      <div class="report-card span-2">
        <h3>⚠️ Tarefas em Atraso (${overdueTasks.length})</h3>
        ${overdueTasks.length === 0
          ? '<p style="color:var(--success)">✅ Nenhuma tarefa em atraso!</p>'
          : `<table class="report-table">
            <thead><tr>
              <th>ID</th><th>Título</th><th>Status</th><th>Área</th>
              <th>Solicitante</th><th>Prazo</th><th>Prio</th>
            </tr></thead>
            <tbody>
              ${overdueTasks.map(t => `<tr>
                <td><span style="font-family:monospace;color:var(--accent);font-weight:700">${t.id}</span></td>
                <td>${escapeHtml(t.title)}</td>
                <td>${UI.statusBadge(t.status)}</td>
                <td>${escapeHtml(t.area)}</td>
                <td>${escapeHtml(t.solicitor)}</td>
                <td style="color:var(--danger);font-weight:600">${UI.formatDateForDisplay(t.dueDate)}</td>
                <td><strong>${t.priority}</strong></td>
              </tr>`).join('')}
            </tbody>
          </table>`}
      </div>

      <!-- Concluídas no Mês -->
      <div class="report-card">
        <h3>✅ Concluídas no Mês (${doneTasks.length})</h3>
        ${doneTasks.length === 0
          ? '<p style="color:var(--text-3)">Nenhuma tarefa concluída neste mês.</p>'
          : `<table class="report-table">
            <thead><tr><th>ID</th><th>Título</th><th>Conclusão</th></tr></thead>
            <tbody>
              ${doneTasks.map(t => `<tr>
                <td style="font-family:monospace;color:var(--accent);font-weight:700">${t.id}</td>
                <td>${escapeHtml(t.title)}</td>
                <td>${UI.formatDateTime(t.closedAt)}</td>
              </tr>`).join('')}
            </tbody>
          </table>`}
      </div>

      <!-- Recursos -->
      <div class="report-card">
        <h3>👥 Recursos (${resources.length})</h3>
        ${resources.length === 0
          ? '<p style="color:var(--text-3)">Nenhum recurso cadastrado.</p>'
          : `<table class="report-table">
            <thead><tr><th>Nome</th><th>Tipo</th><th>Status</th><th>Tarefas</th></tr></thead>
            <tbody>
              ${resOverview.map(r => {
                const si = getResourceStatusInfo(r.status);
                return `<tr>
                  <td><strong>${escapeHtml(r.name)}</strong></td>
                  <td>${escapeHtml(r.type)}</td>
                  <td><span class="resource-status-badge ${si.cssClass}">${si.label}</span></td>
                  <td>${r.active}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
      </div>
    `;
  }

  /* ---- Exportação CSV ---- */
  function exportCsv() {
    const tasks   = Store.getTasks().sort((a, b) => a.priority - b.priority);
    const headers = [
      'ID', 'Título', 'Prioridade', 'Status', 'Área', 'Solicitante',
      'Recursos', 'Data Abertura', 'Data Prevista', 'Data Conclusão',
      'Descrição', 'Observações',
    ];

    const rows = tasks.map(t => [
      t.id,
      `"${(t.title       || '').replace(/"/g, '""')}"`,
      t.priority,
      getStatusLabel(t.status),
      t.area,
      `"${(t.solicitor   || '').replace(/"/g, '""')}"`,
      `"${(t.resources   || []).join('; ').replace(/"/g, '""')}"`,
      UI.formatDateTime(t.openedAt),
      t.dueDate  ? UI.formatDateForDisplay(t.dueDate) : '',
      t.closedAt ? UI.formatDateTime(t.closedAt)      : '',
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${(t.notes       || '').replace(/"/g, '""')}"`,
    ]);

    const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);

    Object.assign(document.createElement('a'), {
      href:     url,
      download: `priority_manager_${new Date().toISOString().slice(0, 10)}.csv`,
    }).click();

    URL.revokeObjectURL(url);
    UI.toast('CSV exportado com sucesso!', 'success');
  }

  /* ---- Init ---- */
  function init() {
    document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  }

  return { init, render };
})();
