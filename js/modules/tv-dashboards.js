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
  let pipelineTypeFilter = 'TODOS'; // 'TODOS' | 'SISTEMAS' | 'INFRAESTRUTURA'
  let refreshTimer = null;
  let clockTimer = null;
  let chartInstance = null;
  let autoSwitchTimer = null;
  let autoSwitchEnabled = false;
  let autoSwitchIntervalMs = 30000;

  // Painéis visíveis nas abas (manual)
  const PANELS = [
    { key: 'overview', label: 'Visão Geral', icon: '📊' },
    { key: 'pipeline', label: 'Pipeline',    icon: '🔄' },
    { key: 'team',     label: 'Equipe',      icon: '👥' },
  ];

  // Sequência de auto-play: inclui pipeline separado por tipo
  const AUTO_PANELS = [
    { key: 'overview',  typeFilter: null           },
    { key: 'pipeline',  typeFilter: 'SISTEMAS'     },
    { key: 'pipeline',  typeFilter: 'INFRAESTRUTURA' },
    { key: 'team',      typeFilter: null           },
  ];
  let autoSwitchIndex = 0;  // índice dentro de AUTO_PANELS

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

    const total      = tasks.length;
    const overdue    = tasks.filter(t => UI.isOverdue(t)).length;
    const concluded  = tasks.filter(t => t.status === 'CONCLUIDO').length;
    const pending    = tasks.filter(t => t.status === 'PENDENTE').length;
    const inProgress = tasks.filter(t => !['CONCLUIDO', 'PENDENTE'].includes(t.status)).length;
    const doneMonth  = tasks.filter(t => {
      if (t.status !== 'CONCLUIDO' || !t.closedAt) return false;
      const d = new Date(t.closedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const available  = resources.filter(r => r.status === 'DISPONIVEL').length;
    const busy       = resources.filter(r => r.status === 'OCUPADO').length;
    const onLeave    = resources.filter(r => ['FERIAS','AFASTADO'].includes(r.status)).length;
    const sistCount  = tasks.filter(t => (t.projectType || 'SISTEMAS') === 'SISTEMAS').length;
    const infraCount = tasks.filter(t => t.projectType === 'INFRAESTRUTURA').length;
    const critical   = tasks.filter(t => t.isCritical && t.status !== 'CONCLUIDO').length;

    /* ---------- Health Score ---------- */
    let healthScore = 100;
    if (total > 0) {
      healthScore -= Math.round((overdue / total) * 50);
      healthScore -= Math.round((critical / total) * 20);
      if (busy / Math.max(resources.length, 1) > 0.8) healthScore -= 10;
    }
    healthScore = Math.max(0, Math.min(100, healthScore));
    const healthColor = healthScore >= 75 ? '#22c55e' : healthScore >= 50 ? '#f59e0b' : '#ef4444';
    const healthLabel = healthScore >= 75 ? 'Saudável' : healthScore >= 50 ? 'Atenção' : 'Crítico';
    const healthIcon  = healthScore >= 75 ? '🟢' : healthScore >= 50 ? '🟡' : '🔴';

    /* ---------- Conclusão geral ---------- */
    const conclusionPct = total > 0 ? Math.round((concluded / total) * 100) : 0;
    const availPct      = resources.length > 0 ? Math.round((available / resources.length) * 100) : 0;

    /* ---------- Métricas ---------- */
    const metrics = [
      {
        icon: '📋', label: 'Total de Projetos', value: total,
        sub: `${inProgress} em andamento`,
        color: '#6366f1',
        pct: conclusionPct,
        pctLabel: `${conclusionPct}% concluídos`,
        danger: false,
      },
      {
        icon: '⚠️', label: 'Em Atraso', value: overdue,
        sub: overdue > 0 ? `${Math.round(overdue/Math.max(total,1)*100)}% do portfólio` : 'Nenhum atraso',
        color: overdue > 0 ? '#ef4444' : '#22c55e',
        pct: overdue > 0 ? Math.round(overdue/Math.max(total,1)*100) : 0,
        pctLabel: overdue > 0 ? `${Math.round(overdue/Math.max(total,1)*100)}% em atraso` : '0% em atraso',
        danger: overdue > 0,
      },
      {
        icon: '✅', label: 'Concluídos no Mês', value: doneMonth,
        sub: `de ${total} no total`,
        color: '#22c55e',
        pct: total > 0 ? Math.round(doneMonth/total*100) : 0,
        pctLabel: `${total > 0 ? Math.round(doneMonth/total*100) : 0}% do total`,
        danger: false,
      },
      {
        icon: '👥', label: 'Recursos Disponíveis', value: available,
        sub: `${busy} ocupados • ${onLeave} afastados`,
        color: '#0d9488',
        pct: availPct,
        pctLabel: `${availPct}% disponíveis`,
        danger: false,
      },
      {
        icon: '💻', label: 'Projetos Sistemas', value: sistCount,
        sub: `${total > 0 ? Math.round(sistCount/total*100) : 0}% do portfólio`,
        color: '#818cf8',
        pct: total > 0 ? Math.round(sistCount/total*100) : 0,
        pctLabel: `${total > 0 ? Math.round(sistCount/total*100) : 0}% do total`,
        danger: false,
      },
      {
        icon: '🔧', label: 'Infraestrutura', value: infraCount,
        sub: `${total > 0 ? Math.round(infraCount/total*100) : 0}% do portfólio`,
        color: '#fb923c',
        pct: total > 0 ? Math.round(infraCount/total*100) : 0,
        pctLabel: `${total > 0 ? Math.round(infraCount/total*100) : 0}% do total`,
        danger: false,
      },
    ];

    /* ---------- Barras por área ---------- */
    const areaCounts = {};
    tasks.forEach(t => { const a = t.area || 'Outros'; areaCounts[a] = (areaCounts[a] || 0) + 1; });
    const maxArea = Math.max(...Object.values(areaCounts), 1);
    const areaRows = Object.entries(areaCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([area, count]) => {
        const pct = Math.round(count / maxArea * 100);
        return `
          <div class="tv-area-bar-row">
            <span class="tv-area-bar-label">${escapeHtml(area)}</span>
            <div class="tv-area-bar-track">
              <div class="tv-area-bar-fill" style="width:${pct}%"></div>
            </div>
            <span class="tv-area-bar-count">${count}</span>
          </div>`;
      }).join('');

    /* ---------- Distribuição de status ---------- */
    const statusDist = STATUSES.map(s => {
      const cnt = tasks.filter(t => t.status === s.key).length;
      const pct = total > 0 ? (cnt / total * 100) : 0;
      return { label: s.label, color: s.color, cnt, pct };
    }).filter(s => s.cnt > 0);

    const statusDistHtml = total > 0
      ? statusDist.map(s => `
          <div class="tv-status-dist-seg"
               style="flex:${s.pct};background:${s.color}"
               title="${s.label}: ${s.cnt} (${Math.round(s.pct)}%)"></div>`).join('')
      : '<div class="tv-status-dist-seg" style="flex:1;background:var(--bg-4)"></div>';

    /* ---------- Tarefas Críticas ---------- */
    const criticalTasks = tasks
      .filter(t => t.status !== 'CONCLUIDO' && t.isCritical)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 6);

    /* ---------- Tarefas Atrasadas ---------- */
    const overdueList = tasks
      .filter(t => t.status !== 'CONCLUIDO' && UI.isOverdue(t))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 6);

    const renderItem = t => {
      const dueDateStr = t.dueDate
        ? new Date(t.dueDate + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })
        : null;
      const progress   = t.progress != null ? t.progress : 0;
      const isOv       = UI.isOverdue(t);
      return `
        <div class="tv-critical-item${isOv ? ' tv-critical-item--overdue' : ''}" style="--status-color:${getStatusColor(t.status)}">
          <div class="tv-critical-prio-badge" style="background:${getStatusColor(t.status)}22;color:${getStatusColor(t.status)}">#${t.priority}</div>
          <div class="tv-critical-body">
            <div class="tv-critical-title">${escapeHtml(t.title)}</div>
            <div class="tv-critical-meta">
              <span>${escapeHtml(t.area || '—')}</span>
              <span>•</span>
              <span>${escapeHtml(t.solicitor || '—')}</span>
              ${dueDateStr ? `<span>• 📅 ${dueDateStr}</span>` : ''}
            </div>
            <div class="tv-critical-progress-track">
              <div class="tv-critical-progress-fill" style="width:${progress}%;background:${getStatusColor(t.status)}"></div>
            </div>
          </div>
          <div class="tv-critical-right">
            ${UI.statusBadge(t.status)}
            ${isOv ? '<span class="tv-overdue-badge">⚠ ATRASADA</span>' : `<span class="tv-progress-pct">${progress}%</span>`}
          </div>
        </div>`;
    };

    const criticalHtml = criticalTasks.length === 0
      ? `<div class="tv-empty-list"><span>🎉</span><p>Nenhuma tarefa crítica</p></div>`
      : criticalTasks.map(renderItem).join('');

    const overdueHtml = overdueList.length === 0
      ? `<div class="tv-empty-list"><span>🎉</span><p>Nenhuma tarefa atrasada</p></div>`
      : overdueList.map(renderItem).join('');

    return `
      <!-- ===== HEALTH BANNER ===== -->
      <div class="tv-health-banner" style="--health-color:${healthColor}">
        <div class="tv-health-left">
          <span class="tv-health-icon">${healthIcon}</span>
          <div>
            <div class="tv-health-title">Saúde do Portfólio</div>
            <div class="tv-health-label" style="color:${healthColor}">${healthLabel}</div>
          </div>
        </div>
        <div class="tv-health-score-wrap">
          <svg class="tv-health-ring" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg-4)" stroke-width="7"/>
            <circle cx="40" cy="40" r="34" fill="none"
              stroke="${healthColor}" stroke-width="7"
              stroke-dasharray="${Math.round(2 * Math.PI * 34 * healthScore / 100)} ${Math.round(2 * Math.PI * 34)}"
              stroke-linecap="round"
              transform="rotate(-90 40 40)"/>
            <text x="40" y="44" text-anchor="middle" font-size="18" font-weight="900" fill="${healthColor}">${healthScore}</text>
          </svg>
          <span class="tv-health-score-label">/ 100</span>
        </div>
        <div class="tv-health-stats">
          <div class="tv-health-stat"><span>${concluded}</span><label>Concluídos</label></div>
          <div class="tv-health-stat"><span style="color:#f59e0b">${inProgress}</span><label>Em Andamento</label></div>
          <div class="tv-health-stat"><span style="color:#ef4444">${overdue}</span><label>Atrasados</label></div>
          <div class="tv-health-stat"><span style="color:#6366f1">${pending}</span><label>Pendentes</label></div>
        </div>
        <div class="tv-status-dist-bar">
          <div class="tv-status-dist-label">Distribuição de Status</div>
          <div class="tv-status-dist-track">${statusDistHtml}</div>
          <div class="tv-status-dist-legend">
            ${statusDist.map(s => `<span style="color:${s.color}">● ${s.label} (${s.cnt})</span>`).join('')}
          </div>
        </div>
      </div>

      <!-- ===== MÉTRICAS ===== -->
      <div class="tv-overview-grid cols-6">
        ${metrics.map((m, i) => `
          <div class="tv-metric-card${m.danger ? ' tv-metric-card--danger' : ''}" style="--m-color:${m.color};--delay:${i * 60}ms">
            <div class="tv-metric-top">
              <div class="tv-metric-icon">${m.icon}</div>
              <div class="tv-metric-pct" style="color:${m.color}">${m.pct}%</div>
            </div>
            <div class="tv-metric-label">${m.label}</div>
            <div class="tv-metric-value">${m.value}</div>
            <div class="tv-metric-sub">${m.sub}</div>
            <div class="tv-metric-bar-track">
              <div class="tv-metric-bar-fill" style="width:${m.pct}%;background:${m.color}"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- ===== GRÁFICOS ===== -->
      <div class="tv-charts-row">
        <div class="tv-chart-card">
          <h3>📊 Status dos Projetos</h3>
          <div class="tv-chart-canvas">
            <canvas id="tvChartStatus"></canvas>
          </div>
        </div>
        <div class="tv-chart-card">
          <h3>🏢 Demandas por Área</h3>
          <div class="tv-area-bars">
            ${areaRows || '<p style="color:var(--text-3);font-style:italic;padding:12px 0">Sem dados de área</p>'}
          </div>
        </div>
      </div>

      <!-- ===== CRÍTICAS / ATRASADAS ===== -->
      <div class="tv-bottom-row">
        <div class="tv-critical-section">
          <div class="tv-critical-section-header">
            <h3>⚡ Tarefas Críticas</h3>
            <span class="tv-section-badge tv-section-badge--critical">${criticalTasks.length}</span>
          </div>
          <div class="tv-critical-list">${criticalHtml}</div>
        </div>
        <div class="tv-critical-section tv-critical-section--overdue">
          <div class="tv-critical-section-header">
            <h3>🚨 Tarefas Atrasadas</h3>
            <span class="tv-section-badge tv-section-badge--overdue">${overdueList.length}</span>
          </div>
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

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim() || (isDark ? '#94a3b8' : '#64748b');

    chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: STATUSES.map(s => s.label),
        datasets: [{
          data: STATUSES.map(s => statusCounts[s.key]),
          backgroundColor: STATUSES.map(s => s.color),
          borderWidth: 2,
          borderColor: isDark ? '#1e293b' : '#f8fafc',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { animateRotate: true, duration: 800, easing: 'easeInOutQuart' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textColor,
              font: { size: 11, weight: '600' },
              boxWidth: 10,
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round(ctx.parsed / total * 100) : 0;
                return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
              }
            }
          }
        },
        cutout: '68%',
      },
    });
  }

  /* ==============================================================
     PAINEL 2 — PIPELINE
  ============================================================== */

  function renderPipeline() {
    const allTasks = Store.getTasks();
    const tasks = pipelineTypeFilter === 'TODOS'
      ? allTasks
      : allTasks.filter(t => (t.projectType || 'SISTEMAS') === pipelineTypeFilter);

    // Barra de filtro de tipo
    const filterBar = `
      <div class="tv-pipeline-filter-bar" id="tvPipelineFilterBar">
        <button class="tv-type-btn ${pipelineTypeFilter === 'TODOS'          ? 'active'   : ''}" data-filter="TODOS">📊 Todos</button>
        <button class="tv-type-btn tv-type-btn-sist ${pipelineTypeFilter === 'SISTEMAS'      ? 'active-sist' : ''}" data-filter="SISTEMAS">💻 Sistemas</button>
        <button class="tv-type-btn tv-type-btn-infra ${pipelineTypeFilter === 'INFRAESTRUTURA' ? 'active-infra' : ''}" data-filter="INFRAESTRUTURA">🔧 Infraestrutura</button>
      </div>`;

    const cols = STATUSES.map(s => {
      const colTasks = tasks.filter(t => t.status === s.key).sort((a, b) => a.priority - b.priority);

      const items = colTasks.length === 0
        ? '<div style="color:var(--text-3);font-size:0.8rem;padding:8px 12px;font-style:italic">Vazio</div>'
        : colTasks.map(t => {
            const ptBadge = t.projectType === 'INFRAESTRUTURA'
              ? '<span class="project-type-badge pt-infra" style="font-size:0.6rem;padding:2px 6px;">🔧 Infra</span>'
              : '<span class="project-type-badge pt-sistemas" style="font-size:0.6rem;padding:2px 6px;">💻 Sist</span>';
            return `
            <div class="tv-pipeline-item" style="--col-color:${s.color}">
              <span class="tv-pipeline-item-id">${escapeHtml(t.id)}</span>
              ${pipelineTypeFilter === 'TODOS' ? ptBadge : ''}
              <span class="tv-pipeline-item-title">${escapeHtml(t.title)}</span>
              <span class="tv-pipeline-item-meta">${escapeHtml(t.area || '—')} • Prio ${t.priority}</span>
              ${UI.isOverdue(t) ? '<span class="tv-pipeline-item-overdue">⚠ ATRASADA</span>' : ''}
            </div>`;
          }).join('');

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

    return `${filterBar}<div class="tv-pipeline">${cols.join('')}</div>`;
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

      // Separar por tipo
      const sistTasks  = myTasks.filter(t => (t.projectType || 'SISTEMAS') === 'SISTEMAS');
      const infraTasks = myTasks.filter(t => t.projectType === 'INFRAESTRUTURA');

      function renderTaskRow(t) {
        return `
          <div class="tv-resource-task-item">
            <div class="tv-resource-task-dot" style="background:${getStatusColor(t.status)}"></div>
            <span class="tv-resource-task-title">${escapeHtml(t.title)}</span>
            ${UI.isOverdue(t) ? '<span style="color:var(--danger);font-size:0.68rem;font-weight:800;flex-shrink:0">⚠</span>' : ''}
          </div>`;
      }

      let taskItems = '';
      if (myTasks.length === 0) {
        taskItems = '<div class="tv-resource-no-tasks">Sem tarefas ativas</div>';
      } else {
        if (sistTasks.length > 0) {
          taskItems += `
            <div class="tv-task-type-header pt-sistemas">
              💻 Sistemas <span style="opacity:.6;font-weight:400">(${sistTasks.length})</span>
            </div>
            ${sistTasks.slice(0, 3).map(renderTaskRow).join('')}
            ${sistTasks.length > 3 ? `<div class="tv-resource-no-tasks tv-more-tasks-btn" data-resource="${escapeHtml(r.name)}" style="cursor:pointer;color:var(--accent);font-weight:600;padding:4px 0;">+${sistTasks.length - 3} mais...</div>` : ''}`;
        }
        if (infraTasks.length > 0) {
          taskItems += `
            <div class="tv-task-type-header pt-infra">
              🔧 Infraestrutura <span style="opacity:.6;font-weight:400">(${infraTasks.length})</span>
            </div>
            ${infraTasks.slice(0, 3).map(renderTaskRow).join('')}
            ${infraTasks.length > 3 ? `<div class="tv-resource-no-tasks tv-more-tasks-btn" data-resource="${escapeHtml(r.name)}" style="cursor:pointer;color:var(--accent);font-weight:600;padding:4px 0;">+${infraTasks.length - 3} mais...</div>` : ''}`;
        }
      }

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

    // Bind dos botões de filtro do Pipeline
    if (currentPanel === 'pipeline') {
      document.querySelectorAll('#tvPipelineFilterBar .tv-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          pipelineTypeFilter = btn.dataset.filter;
          renderContent();
          if (autoSwitchEnabled) startAutoSwitch(); // reinicia ciclo ao mudar manualmente
        });
      });
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
      autoSwitchIndex = (autoSwitchIndex + 1) % AUTO_PANELS.length;
      const next = AUTO_PANELS[autoSwitchIndex];
      currentPanel = next.key;
      if (next.typeFilter !== null) pipelineTypeFilter = next.typeFilter;
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
        pipelineTypeFilter = 'TODOS'; // reset filtro ao clicar na aba manualmente
        autoSwitchIndex = AUTO_PANELS.findIndex(p => p.key === currentPanel && !p.typeFilter);
        if (autoSwitchIndex < 0) autoSwitchIndex = 0;
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
