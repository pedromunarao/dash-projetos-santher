/**
 * modules/tv-dashboards.js
 * Três painéis otimizados para exibição em TV / tela cheia:
 *   1. Visão Geral  – métricas grandes + gráfico + tarefas críticas
 *   2. Pipeline     – kanban horizontal compacto por status
 *   3. Equipe       – cards de recursos e suas tarefas ativas
 *
 * Depende de: Store, UI, STATUSES, getStatusColor, escapeHtml (globals)
 */

const TVDashboards = (() => {

  let currentPanel = 'overview';
  let refreshTimer = null;
  let clockTimer = null;
  let chartInstance = null;
  let autoSwitchTimer = null;
  let autoSwitchEnabled = false;
  let autoSwitchIntervalMs = 30000;

  const PANELS = [
    { key: 'overview', label: 'Visão Geral', icon: '📊' },
    { key: 'pipeline', label: 'Pipeline', icon: '🔄' },
    { key: 'team', label: 'Equipe', icon: '👥' },
  ];

  /* ---- Cores para avatares ---- */
  const AVATAR_COLORS = ['#6366f1', '#0d9488', '#f97316', '#e879f9', '#06b6d4', '#84cc16', '#f43f5e'];

  function avatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  /* ==============================================================
     PAINEL 1 — VISÃO GERAL
  ============================================================== */

  function renderOverview() {
    const tasks = Store.getTasks();
    const resources = Store.getResources();
    const now = new Date();

    const total = tasks.length;
    const overdue = tasks.filter(t => UI.isOverdue(t)).length;
    const inProgress = tasks.filter(t => !['CONCLUIDO', 'PENDENTE'].includes(t.status)).length;
    const doneMonth = tasks.filter(t => {
      if (t.status !== 'CONCLUIDO' || !t.closedAt) return false;
      const d = new Date(t.closedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const available = resources.filter(r => r.status === 'DISPONIVEL').length;
    const busy = resources.filter(r => r.status === 'OCUPADO').length;

    const metrics = [
      { icon: '📋', label: 'Total de Projetos', value: total, sub: `${inProgress} em andamento`, color: '#6366f1' },
      { icon: '⚠️', label: 'Projetos Em Atraso', value: overdue, sub: 'prazo ultrapassado', color: overdue > 0 ? '#ef4444' : '#22c55e' },
      { icon: '✅', label: 'Projetos Concluídos no Mês', value: doneMonth, sub: `de ${total} no total`, color: '#22c55e' },
      { icon: '👥', label: 'Recursos Disponíveis', value: available, sub: `${busy} ocupados`, color: '#0d9488' },
    ];

    /* Barras por área */
    const areaCounts = {};
    tasks.forEach(t => { const a = t.area || 'Outros'; areaCounts[a] = (areaCounts[a] || 0) + 1; });
    const maxArea = Math.max(...Object.values(areaCounts), 1);
    const areaRows = Object.entries(areaCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([area, count]) => `
        <div class="tv-area-bar-row">
          <span class="tv-area-bar-label">${escapeHtml(area)}</span>
          <div class="tv-area-bar-track">
            <div class="tv-area-bar-fill" style="width:${Math.round(count / maxArea * 100)}%"></div>
          </div>
          <span class="tv-area-bar-count">${count}</span>
        </div>
      `).join('');

    /* Tarefas Críticas (isCritical = true) */
    const critical = tasks
      .filter(t => t.status !== 'CONCLUIDO' && t.isCritical)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 5);

    /* Tarefas Atrasadas (UI.isOverdue(t) = true) */
    const overdueList = tasks
      .filter(t => t.status !== 'CONCLUIDO' && UI.isOverdue(t))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 5);

    const renderItem = t => `
      <div class="tv-critical-item" style="--status-color:${getStatusColor(t.status)}">
        <div class="tv-critical-prio">${t.priority}</div>
        <div>
          <div class="tv-critical-title">${escapeHtml(t.title)}</div>
          <div class="tv-critical-area">${escapeHtml(t.area)} • ${escapeHtml(t.solicitor)}</div>
        </div>
        <div>${UI.statusBadge(t.status)}</div>
        ${UI.isOverdue(t) ? '<span style="color:var(--danger);font-size:0.75rem;font-weight:800;white-space:nowrap">⚠ ATRASADA</span>' : '<span></span>'}
      </div>
    `;

    const criticalHtml = critical.length === 0
      ? '<p style="color:var(--text-3);font-style:italic;padding:8px;font-size:0.9rem">Nenhuma tarefa crítica no momento 🎉</p>'
      : critical.map(renderItem).join('');

    const overdueHtml = overdueList.length === 0
      ? '<p style="color:var(--text-3);font-style:italic;padding:8px;font-size:0.9rem">Nenhuma tarefa atrasada no momento 🎉</p>'
      : overdueList.map(renderItem).join('');

    return `
      <div class="tv-overview-grid">
        ${metrics.map(m => `
          <div class="tv-metric-card" style="--m-color:${m.color}">
            <div class="tv-metric-icon">${m.icon}</div>
            <div class="tv-metric-label">${m.label}</div>
            <div class="tv-metric-value">${m.value}</div>
            <div class="tv-metric-sub">${m.sub}</div>
          </div>
        `).join('')}
      </div>

      <div class="tv-charts-row">
        <div class="tv-chart-card">
          <h3>Status dos Projetos</h3>
          <div class="tv-chart-canvas">
            <canvas id="tvChartStatus"></canvas>
          </div>
        </div>
        <div class="tv-chart-card">
          <h3>Demandas por Área</h3>
          <div class="tv-area-bars">
            ${areaRows || '<p style="color:var(--text-3);font-style:italic">Sem dados</p>'}
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
        <div class="tv-critical-section" style="margin-top: 0;">
          <h3>⚡ Tarefas Críticas</h3>
          <div class="tv-critical-list">${criticalHtml}</div>
        </div>
        <div class="tv-critical-section" style="margin-top: 0;">
          <h3 style="color: var(--danger)">⚠ Tarefas Atrasadas</h3>
          <div class="tv-critical-list">${overdueHtml}</div>
        </div>
      </div>
    `;
  }

  function mountOverviewChart() {
    if (!window.Chart) return;
    const tasks = Store.getTasks();
    const statusCounts = {};
    STATUSES.forEach(s => statusCounts[s.key] = 0);
    tasks.forEach(t => { if (statusCounts[t.status] !== undefined) statusCounts[t.status]++; });

    const ctx = document.getElementById('tvChartStatus');
    if (!ctx) return;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: STATUSES.map(s => s.label),
        datasets: [{
          data: STATUSES.map(s => statusCounts[s.key]),
          backgroundColor: STATUSES.map(s => s.color),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim(),
              font: { size: 11 },
              boxWidth: 12,
            },
          },
        },
        cutout: '65%',
      },
    });
  }

  /* ==============================================================
     PAINEL 2 — PIPELINE
  ============================================================== */

  function renderPipeline() {
    const tasks = Store.getTasks();

    const cols = STATUSES.map(s => {
      const colTasks = tasks.filter(t => t.status === s.key).sort((a, b) => a.priority - b.priority);

      const items = colTasks.length === 0
        ? '<div style="color:var(--text-3);font-size:0.8rem;padding:8px 12px;font-style:italic">Vazio</div>'
        : colTasks.map(t => `
            <div class="tv-pipeline-item" style="--col-color:${s.color}">
              <span class="tv-pipeline-item-id">${escapeHtml(t.id)}</span>
              <span class="tv-pipeline-item-title">${escapeHtml(t.title)}</span>
              <span class="tv-pipeline-item-meta">${escapeHtml(t.area || '—')} • Prio ${t.priority}</span>
              ${UI.isOverdue(t) ? '<span class="tv-pipeline-item-overdue">⚠ ATRASADA</span>' : ''}
            </div>
          `).join('');

      return `
        <div class="tv-pipeline-col">
          <div class="tv-pipeline-header">
            <span class="tv-pipeline-status" style="color:${s.color}">${s.label}</span>
            <span class="tv-pipeline-count">${colTasks.length}</span>
          </div>
          <div class="tv-pipeline-items">${items}</div>
        </div>
      `;
    });

    return `<div class="tv-pipeline">${cols.join('')}</div>`;
  }

  /* ==============================================================
     PAINEL 3 — EQUIPE
  ============================================================== */

  function renderTeam() {
    const resources = Store.getResources();
    const tasks = Store.getTasks();

    const STATUS_STYLE = {
      DISPONIVEL: { label: 'Disponível', bg: '#22c55e22', color: '#16a34a' },
      OCUPADO: { label: 'Ocupado', bg: '#ef444422', color: '#dc2626' },
      FERIAS: { label: 'Férias', bg: '#f59e0b22', color: '#d97706' },
      AFASTADO: { label: 'Afastado', bg: '#94a3b822', color: '#64748b' },
    };

    const avail = resources.filter(r => r.status === 'DISPONIVEL').length;
    const busy = resources.filter(r => r.status === 'OCUPADO').length;
    const onLeave = resources.filter(r => ['FERIAS', 'AFASTADO'].includes(r.status)).length;
    const active = tasks.filter(t => t.status !== 'CONCLUIDO').length;

    const summaryHtml = `
      <div class="tv-team-summary">
        <div class="tv-team-stat">
          <span class="tv-team-stat-icon">👥</span>
          <div class="tv-team-stat-info">
            <span class="tv-team-stat-value">${resources.length}</span>
            <span class="tv-team-stat-label">Total de Recursos</span>
          </div>
        </div>
        <div class="tv-team-stat">
          <span class="tv-team-stat-icon">✅</span>
          <div class="tv-team-stat-info">
            <span class="tv-team-stat-value" style="color:#22c55e">${avail}</span>
            <span class="tv-team-stat-label">Disponíveis</span>
          </div>
        </div>
        <div class="tv-team-stat">
          <span class="tv-team-stat-icon">⚙️</span>
          <div class="tv-team-stat-info">
            <span class="tv-team-stat-value" style="color:#ef4444">${busy}</span>
            <span class="tv-team-stat-label">Ocupados</span>
          </div>
        </div>
        <div class="tv-team-stat">
          <span class="tv-team-stat-icon">📋</span>
          <div class="tv-team-stat-info">
            <span class="tv-team-stat-value" style="color:#6366f1">${active}</span>
            <span class="tv-team-stat-label">Tarefas Ativas</span>
          </div>
        </div>
      </div>
    `;

    if (resources.length === 0) {
      return `${summaryHtml}
        <div style="text-align:center;padding:64px;color:var(--text-3)">
          <div style="font-size:3rem;margin-bottom:12px">👤</div>
          Nenhum recurso cadastrado ainda.
        </div>`;
    }

    const cards = resources.map(r => {
      const info = STATUS_STYLE[r.status] || STATUS_STYLE.AFASTADO;
      const initials = r.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
      const color = avatarColor(r.name);
      const myTasks = tasks.filter(t => (t.resources || []).includes(r.name) && t.status !== 'CONCLUIDO');

      const taskItems = myTasks.length === 0
        ? '<div class="tv-resource-no-tasks">Sem tarefas ativas</div>'
        : myTasks.slice(0, 4).map(t => `
            <div class="tv-resource-task-item">
              <div class="tv-resource-task-dot" style="background:${getStatusColor(t.status)}"></div>
              <span class="tv-resource-task-title">${escapeHtml(t.title)}</span>
              ${UI.isOverdue(t) ? '<span style="color:var(--danger);font-size:0.68rem;font-weight:800;flex-shrink:0">⚠</span>' : ''}
            </div>
          `).join('')
        + (myTasks.length > 4 ? `<div class="tv-resource-no-tasks tv-more-tasks-btn" data-resource="${escapeHtml(r.name)}" style="cursor:pointer; color:var(--accent); font-weight:600; padding:4px; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background='var(--bg-3)'" onmouseout="this.style.background='transparent'">+${myTasks.length - 4} mais... (ver todas)</div>` : '');

      return `
        <div class="tv-resource-card">
          <div class="tv-resource-header">
            <div class="tv-resource-avatar" style="background:${color}">${initials}</div>
            <div>
              <div class="tv-resource-name">${escapeHtml(r.name)}</div>
              <div class="tv-resource-type">${escapeHtml(r.type)}</div>
            </div>
            <span class="tv-resource-status-badge" style="background:${info.bg};color:${info.color}">
              ${info.label}
            </span>
          </div>
          <div class="tv-resource-tasks">${taskItems}</div>
        </div>
      `;
    });

    return `${summaryHtml}<div class="tv-team-grid">${cards.join('')}</div>`;
  }

  /* ==============================================================
     RENDER CENTRAL
  ============================================================== */

  function renderContent() {
    const el = document.getElementById('tvContent');
    if (!el) return;

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    if (currentPanel === 'overview') el.innerHTML = renderOverview();
    else if (currentPanel === 'pipeline') el.innerHTML = renderPipeline();
    else if (currentPanel === 'team') el.innerHTML = renderTeam();

    if (currentPanel === 'overview') {
      requestAnimationFrame(mountOverviewChart);
    }

    /* Atualiza aba ativa */
    document.querySelectorAll('.tv-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.panel === currentPanel);
    });
  }

  /* ==============================================================
     RELÓGIO
  ============================================================== */

  function startClock() {
    clearInterval(clockTimer);
    const el = document.getElementById('tvClock');
    if (!el) return;
    const tick = () => {
      el.textContent = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    };
    tick();
    clockTimer = setInterval(tick, 1000);
  }

  /* ==============================================================
     AUTO-REFRESH (30 s)
  ============================================================== */

  function startRefresh() {
    clearInterval(refreshTimer);
    let countdown = 30;
    const badge = document.getElementById('tvRefreshBadge');
    if (badge) badge.textContent = `Atualiza em ${countdown}s`;

    refreshTimer = setInterval(() => {
      countdown--;
      if (badge) badge.textContent = `Atualiza em ${countdown}s`;
      if (countdown <= 0) {
        countdown = 30;
        renderContent();
      }
    }, 1000);
  }

  /* ==============================================================
     FULLSCREEN
  ============================================================== */

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen();
    }
  }

  /* ==============================================================
     AUTO-SWITCH (Navegação automática entre abas)
  ============================================================== */

  function startAutoSwitch() {
    clearInterval(autoSwitchTimer);
    if (!autoSwitchEnabled) return;
    autoSwitchTimer = setInterval(() => {
      const currentIndex = PANELS.findIndex(p => p.key === currentPanel);
      const nextIndex = (currentIndex + 1) % PANELS.length;
      currentPanel = PANELS[nextIndex].key;
      renderContent();
    }, autoSwitchIntervalMs);
  }

  /* ==============================================================
     RENDER (chamado ao navegar para a página)
  ============================================================== */

  function render() {
    renderContent();
    startClock();
    startRefresh();
    startAutoSwitch();
  }

  /* ==============================================================
     INIT (chamado no boot)
  ============================================================== */

  function init() {
    document.querySelectorAll('.tv-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPanel = btn.dataset.panel;
        renderContent();
        if (autoSwitchEnabled) startAutoSwitch();
      });
    });

    document.getElementById('tvFullscreenBtn')
      ?.addEventListener('click', toggleFullscreen);

    const toggleEl = document.getElementById('tvAutoSwitchToggle');
    const selectEl = document.getElementById('tvAutoSwitchInterval');
    if (toggleEl && selectEl) {
      toggleEl.addEventListener('change', (e) => {
        autoSwitchEnabled = e.target.checked;
        startAutoSwitch();
      });
      selectEl.addEventListener('change', (e) => {
        autoSwitchIntervalMs = Number(e.target.value);
        if (autoSwitchEnabled) startAutoSwitch();
      });
    }

    // Modal de tarefas do recurso (delegação de evento)
    const tvContent = document.getElementById('tvContent');
    if (tvContent) {
      tvContent.addEventListener('click', (e) => {
        const btn = e.target.closest('.tv-more-tasks-btn');
        if (btn) {
          showResourceTasks(btn.dataset.resource);
        }
      });
    }

    const modalCloseBtn = document.getElementById('resourceTasksModalClose');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => {
        document.getElementById('resourceTasksModal')?.classList.add('hidden');
      });
    }
  }

  /* ==============================================================
     MODAL DE TAREFAS DO RECURSO
  ============================================================== */
  function showResourceTasks(resourceName) {
    const tasks = Store.getTasks().filter(t => (t.resources || []).includes(resourceName) && t.status !== 'CONCLUIDO');
    const modal = document.getElementById('resourceTasksModal');
    const title = document.getElementById('resourceTasksModalTitle');
    const list = document.getElementById('resourceTasksModalList');

    if (!modal || !title || !list) return;

    title.textContent = `Tarefas ativas: ${resourceName}`;

    list.innerHTML = tasks.length === 0
      ? '<div style="color:var(--text-3); font-style:italic;">Nenhuma tarefa ativa.</div>'
      : tasks.map(t => `
        <div style="background:var(--bg-3); padding:12px; border-radius:var(--radius-sm); margin-bottom:8px; border-left:3px solid ${getStatusColor(t.status)}; display:flex; flex-direction:column; gap:6px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <span style="font-weight:600; color:var(--text); line-height:1.3;">${escapeHtml(t.title)}</span>
            <span style="font-size:0.75rem; font-family:monospace; color:var(--text-3); margin-left:8px; flex-shrink:0;">${escapeHtml(t.id)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem;">
            <span style="color:var(--text-2);">${escapeHtml(t.area || '—')}</span>
            ${UI.statusBadge(t.status)}
          </div>
        </div>
      `).join('');

    modal.classList.remove('hidden');
  }

  return { init, render };
})();
