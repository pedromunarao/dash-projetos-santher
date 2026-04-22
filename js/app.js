/**
 * app.js – Controlador principal da aplicação
 *
 * Responsabilidades:
 *   – Bootstrap assíncrono: carrega dados da API antes de renderizar
 *   – Roteamento client-side entre páginas (navigate)
 *   – Inicialização do sidebar (toggle + estado persistido)
 *   – Alternância de tema (escuro / claro)
 *   – Exibição da data no topbar
 *   – Coordenação do boot: inicializa todos os módulos
 *
 * Depende de: Store, UI, Dashboard, TaskModal, TaskForm,
 *             Kanban, Resources, Reports (globals)
 */

const App = (() => {

  const PAGE_TITLES = {
    dashboard:       'Dashboard',
    kanban:          'Kanban Board',
    'new-task':      'Nova Tarefa',
    resources:       'Recursos',
    reports:         'Relatórios',
    tv:              'Dashboard',
    'kanban-config': 'Configurar Kanban',
    cadastros:       'Cadastros',
  };

  /* ============================================================
     NAVEGAÇÃO
  ============================================================ */

  function navigate(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));

    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;

    if (page === 'dashboard')      Dashboard.render();
    if (page === 'kanban')         Kanban.render();
    if (page === 'new-task' && !document.getElementById('editTaskId').value) TaskForm.openNew();
    if (page === 'resources')      Resources.render();
    if (page === 'reports')        Reports.render();
    if (page === 'tv')             TVDashboards.render();
    if (page === 'kanban-config')  KanbanConfig.render();
    if (page === 'cadastros')      Cadastros.render();
  }

  /* ============================================================
     SIDEBAR
  ============================================================ */

  function initSidebar() {
    const sidebar = document.getElementById('sidebar');

    if (Store.getSidebarCollapsed()) sidebar.classList.add('collapsed');

    document.getElementById('sidebarToggle').addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      Store.setSidebarCollapsed(sidebar.classList.contains('collapsed'));
    });

    document.getElementById('mobileToggle').addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 700) sidebar.classList.remove('mobile-open');
      });
    });
  }

  /* ============================================================
     TEMA
  ============================================================ */

  function initTheme() {
    const theme = Store.getTheme();
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeBtn(theme);

    document.getElementById('themeToggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next    = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      Store.setTheme(next);
      updateThemeBtn(next);
    });
  }

  function updateThemeBtn(theme) {
    document.querySelector('.theme-icon').textContent             = theme === 'dark' ? '🌙' : '☀️';
    document.querySelector('#themeToggle .nav-label').textContent = theme === 'dark' ? 'Tema Escuro' : 'Tema Claro';
  }

  /* ============================================================
     DATA / HORA
  ============================================================ */

  function initDate() {
    const el = document.getElementById('currentDate');
    function update() {
      el.textContent = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
    }
    update();
    setInterval(update, 60_000);
  }

  /* ============================================================
     LOADING OVERLAY (exibido enquanto carrega do servidor)
  ============================================================ */

  function showLoader() {
    const el = document.getElementById('appLoader');
    if (el) el.classList.remove('hidden');
  }

  function hideLoader() {
    const el = document.getElementById('appLoader');
    if (el) el.classList.add('hidden');
  }

  /* ============================================================
     SINCRONIZA STATUSES COM CONSTANTE GLOBAL
     (os módulos usam a variável STATUSES do constants.js)
  ============================================================ */

  function syncStatuses() {
    if (typeof refreshStatuses === 'function') refreshStatuses();
  }

  /* ============================================================
     BOOT ASSÍNCRONO
  ============================================================ */

  async function init() {
    showLoader();

    /* 1. Carrega todos os dados do banco via API */
    await Store.bootstrap();

    /* 2. Sincroniza STATUSES global com os dados do banco */
    syncStatuses();

    /* 3. Inicializa UI */
    initSidebar();
    initTheme();
    initDate();

    /* 4. Registra listeners de navegação */
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => { e.preventDefault(); navigate(item.dataset.page); });
    });

    document.getElementById('nav-new-task').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('editTaskId').value = '';
      navigate('new-task');
    });

    /* 5. Inicializa módulos */
    Dashboard.init();
    TaskModal.init();
    TaskForm.init();
    Resources.init();
    Reports.init();
    TVDashboards.init();
    KanbanConfig.init();
    Cadastros.init();

    hideLoader();

    /* 6. Navega para o dashboard (painel TV) */
    navigate('tv');
  }

  return { init, navigate };
})();

document.addEventListener('DOMContentLoaded', App.init);
