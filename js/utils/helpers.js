/**
 * utils/helpers.js
 * Utilitários de UI compartilhados entre todos os módulos:
 *   – toast()               → notificações temporárias
 *   – confirm()             → dialog de confirmação (Promise)
 *   – statusBadge()         → HTML de badge de status
 *   – formatDate()          → data ISO → dd/mm/aaaa
 *   – formatDateTime()      → data ISO → dd/mm/aaaa hh:mm
 *   – formatDateForDisplay() → 'yyyy-mm-dd' → 'dd/mm/yyyy'
 *   – isOverdue()           → verifica se tarefa está atrasada
 *   – hexToRgba()           → converte cor hex para rgba
 *   – getTasksForResource() → tarefas ativas de um recurso
 *
 * Exportado como `UI` para compatibilidade com os módulos existentes.
 */

const UI = (() => {

  /* ---- Toast ---- */

  /**
   * Exibe uma notificação temporária no canto da tela.
   * @param {string} message – texto a exibir
   * @param {'info'|'success'|'error'} type – variante visual
   */
  function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons     = { success: '✅', error: '❌', info: 'ℹ️' };

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('toast-out');
      el.addEventListener('animationend', () => el.remove());
    }, 3000);
  }

  /* ---- Confirm dialog ---- */

  /**
   * Abre o dialog de confirmação e retorna uma Promise<boolean>.
   * @param {string} title
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  function confirm(title, message) {
    return new Promise(resolve => {
      const overlay = document.getElementById('confirmDialog');
      document.getElementById('confirmTitle').textContent   = title;
      document.getElementById('confirmMessage').textContent = message;
      overlay.classList.remove('hidden');

      const ok     = document.getElementById('confirmOk');
      const cancel = document.getElementById('confirmCancel');

      function cleanup(result) {
        overlay.classList.add('hidden');
        // Remove listeners clonando (evita acúmulo)
        ok.replaceWith(ok.cloneNode(true));
        cancel.replaceWith(cancel.cloneNode(true));
        resolve(result);
      }

      document.getElementById('confirmOk').addEventListener('click',     () => cleanup(true));
      document.getElementById('confirmCancel').addEventListener('click',  () => cleanup(false));
    });
  }

  /* ---- Badges ---- */

  /**
   * Retorna o HTML de um span colorido para o status informado.
   * @param {string} statusKey
   * @returns {string} HTML
   */
  function statusBadge(statusKey) {
    const s   = getStatusByKey(statusKey);
    const hex = s.color;
    return `<span class="status-badge" style="background:${hexToRgba(hex, 0.15)};color:${hex};border:1px solid ${hexToRgba(hex, 0.35)}">${s.label}</span>`;
  }

  /* ---- Formatação de datas ---- */

  /** Converte ISO string para dd/mm/aaaa hh:mm. */
  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return (
      d.toLocaleDateString('pt-BR') + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    );
  }

  /** Converte ISO string para dd/mm/aaaa. */
  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  /** Converte 'yyyy-mm-dd' para 'dd/mm/yyyy'. */
  function formatDateForDisplay(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  /* ---- Verificação de atraso ---- */

  /**
   * Retorna true se a data prevista da tarefa já passou e ela não está concluída.
   * @param {Object} task
   * @returns {boolean}
   */
  function isOverdue(task) {
    if (!task.dueDate || task.status === 'CONCLUIDO') return false;
    return new Date(task.dueDate) < new Date();
  }

  /* ---- Utilidades de cor ---- */

  /**
   * Converte uma cor hex (#rrggbb) em rgba(r, g, b, alpha).
   * @param {string} hex
   * @param {number} alpha – 0 a 1
   * @returns {string}
   */
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /* ---- Consulta de tarefas por recurso ---- */

  /**
   * Retorna as tarefas ativas (não concluídas) que contêm o recurso.
   * @param {string} resourceName
   * @returns {Object[]}
   */
  function getTasksForResource(resourceName) {
    return Store.getTasks().filter(
      t => t.resources && t.resources.includes(resourceName) && t.status !== 'CONCLUIDO'
    );
  }

  /* ---- Rótulo de Prioridade ---- */
  function getPriorityLabel(p) {
    if (p === 0) return 'Alta';
    if (p === 1) return 'Média';
    if (p === 2) return 'Baixa';
    return p;
  }

  /* ---- API pública ---- */
  return {
    toast,
    confirm,
    statusBadge,
    formatDate,
    formatDateTime,
    formatDateForDisplay,
    isOverdue,
    hexToRgba,
    getTasksForResource,
    getPriorityLabel,
  };
})();
