/**
 * core/constants.js
 * Constantes globais da aplicação:
 *   – STATUSES:               lista ordenada de status com chave, rótulo e cor
 *   – AREAS:                  áreas solicitantes disponíveis
 *   – RESOURCE_STATUSES:      status possíveis de um recurso
 *   – DEFAULT_RESOURCE_TYPES: tipos padrão de recurso
 *
 * Funções auxiliares de lookup exportadas globalmente para que
 * os demais módulos não precisem reimplementar a busca.
 */

const DEFAULT_STATUSES = [
  { key: 'PENDENTE',           label: 'PENDENTE',           color: '#6b7280' },
  { key: 'LEVANTAMENTO',       label: 'LEVANTAMENTO',       color: '#7c3aed' },
  { key: 'EM_DESENVOLVIMENTO', label: 'EM DESENVOLVIMENTO', color: '#2563eb' },
  { key: 'SUBIR_HML',          label: 'SUBIR EM HML',       color: '#ca8a04' },
  { key: 'HML_TESTE_DEV',      label: 'HML TESTE DEV',      color: '#f97316' },
  { key: 'HML_TESTE_SANTHER',  label: 'HML TESTE SANTHER',  color: '#ea580c' },
  { key: 'OK_HML',             label: 'OK EM HML',          color: '#0d9488' },
  { key: 'SUBIR_PROD',         label: 'SUBIR EM PROD',      color: '#d97706' },
  { key: 'PROD',               label: 'PROD',               color: '#16a34a' },
  { key: 'CONCLUIDO',          label: 'CONCLUÍDO',          color: '#166534' },
];

/**
 * STATUSES é a variável global consumida por todos os módulos.
 * refreshStatuses() a sincroniza com o localStorage (chamado no boot e após alterações).
 */
let STATUSES = DEFAULT_STATUSES;

function refreshStatuses() {
  STATUSES = Store.getStatuses();
}

// AREAS agora é gerenciado dinamicamente pelo Store (banco SQLite).
// Use Store.getAreas() para ler as áreas disponíveis.

const RESOURCE_STATUSES = [
  { key: 'DISPONIVEL', label: 'DISPONÍVEL', cssClass: 'rs-available' },
  { key: 'OCUPADO',    label: 'OCUPADO',    cssClass: 'rs-busy'      },
  { key: 'FERIAS',     label: 'FÉRIAS',     cssClass: 'rs-vacation'  },
  { key: 'AFASTADO',   label: 'AFASTADO',   cssClass: 'rs-absent'    },
];

const DEFAULT_RESOURCE_TYPES = ['PROGRAMADOR', 'ANALISTA'];

/* ---- Funções de lookup ---- */

/** Retorna o objeto de status pelo key (fallback: primeiro da lista). */
function getStatusByKey(key) {
  return STATUSES.find(s => s.key === key) || STATUSES[0];
}

/** Retorna a cor hex de um status. */
function getStatusColor(key) {
  return getStatusByKey(key).color;
}

/** Retorna o rótulo legível de um status. */
function getStatusLabel(key) {
  return getStatusByKey(key).label;
}

/** Retorna o objeto de status de recurso pelo key (fallback: primeiro da lista). */
function getResourceStatusInfo(key) {
  return RESOURCE_STATUSES.find(s => s.key === key) || RESOURCE_STATUSES[0];
}
