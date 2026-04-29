/**
 * modules/task-form.js
 * Formulário de criação e edição de tarefas.
 * Inclui: validação, resource picker e sugestão de prioridade.
 *
 * Depende de: Store, UI, Dashboard, Kanban, App (globals)
 */

const TaskForm = (() => {

  let currentEditId = null;

  /* ---- Preenche selects estáticos ---- */
  function populateSelects() {
    document.getElementById('taskStatus').innerHTML =
      STATUSES.map(s => `<option value="${s.key}">${s.label}</option>`).join('');
  }

  /* ---- Constrói o picker de recursos ---- */
  function buildResourcePicker(selectedResources = []) {
    const resources = Store.getResources();
    const picker    = document.getElementById('resourcesPicker');

    if (resources.length === 0) {
      picker.innerHTML = '<span style="color:var(--text-3);font-size:0.82rem">Nenhum recurso cadastrado ainda.</span>';
      return;
    }

    picker.innerHTML = resources.map(r => {
      const checked = selectedResources.includes(r.name);
      return `
      <label class="resource-checkbox-item ${checked ? 'checked' : ''}" data-name="${escapeHtml(r.name)}">
        <input type="checkbox" value="${escapeHtml(r.name)}" ${checked ? 'checked' : ''} />
        ${escapeHtml(r.name)} <span style="opacity:.6;font-size:0.7rem">(${escapeHtml(r.type)})</span>
      </label>`;
    }).join('');

    picker.querySelectorAll('.resource-checkbox-item').forEach(item => {
      item.addEventListener('click', () => {
        const cb = item.querySelector('input');
        cb.checked = !cb.checked;
        item.classList.toggle('checked', cb.checked);
      });
    });
  }

  /* ---- Retorna recursos selecionados ---- */
  function getSelectedResources() {
    return Array.from(document.querySelectorAll('#resourcesPicker input:checked')).map(cb => cb.value);
  }

  /* ---- Constrói o picker de Áreas ---- */
  function buildAreaPicker(selectedAreas = []) {
    const areas = Store.getAreas();
    const picker = document.getElementById('areaPicker');

    if (areas.length === 0) {
      picker.innerHTML = '<span style="color:var(--text-3);font-size:0.82rem">Nenhuma área cadastrada.</span>';
      return;
    }

    picker.innerHTML = areas.map(a => {
      const checked = selectedAreas.includes(a);
      return `
      <label class="resource-checkbox-item ${checked ? 'checked' : ''}" data-name="${escapeHtml(a)}">
        <input type="checkbox" value="${escapeHtml(a)}" ${checked ? 'checked' : ''} />
        ${escapeHtml(a)}
      </label>`;
    }).join('');

    picker.querySelectorAll('.resource-checkbox-item').forEach(item => {
      item.addEventListener('click', () => {
        const cb = item.querySelector('input');
        cb.checked = !cb.checked;
        item.classList.toggle('checked', cb.checked);
      });
    });
  }

  /* ---- Constrói o picker de Tipos de Projeto ---- */
  function buildProjectTypePicker(selectedTypes = []) {
    const types = [
      { key: 'SISTEMAS', label: '💻 Sistemas' },
      { key: 'INFRAESTRUTURA', label: '🔧 Infraestrutura' }
    ];
    const picker = document.getElementById('projectTypePicker');

    picker.innerHTML = types.map(t => {
      const checked = selectedTypes.includes(t.key);
      return `
      <label class="resource-checkbox-item ${checked ? 'checked' : ''}" data-name="${escapeHtml(t.key)}">
        <input type="checkbox" value="${escapeHtml(t.key)}" ${checked ? 'checked' : ''} />
        ${t.label}
      </label>`;
    }).join('');

    picker.querySelectorAll('.resource-checkbox-item').forEach(item => {
      item.addEventListener('click', () => {
        const cb = item.querySelector('input');
        cb.checked = !cb.checked;
        item.classList.toggle('checked', cb.checked);
      });
    });
  }

  /* ---- Retorna seleções ---- */
  function getSelectedAreas() {
    return Array.from(document.querySelectorAll('#areaPicker input:checked')).map(cb => cb.value);
  }

  function getSelectedProjectTypes() {
    return Array.from(document.querySelectorAll('#projectTypePicker input:checked')).map(cb => cb.value);
  }

  /* ---- Abre formulário para NOVA tarefa ---- */
  function openNew() {
    currentEditId = null;
    document.getElementById('formTitle').textContent   = 'Nova Tarefa';
    document.getElementById('formTaskId').textContent  = '';
    document.getElementById('taskForm').reset();
    document.getElementById('editTaskId').value        = '';
    document.getElementById('taskPriority').value      = "2"; // Baixa por padrão
    document.getElementById('taskIsCritical').checked  = false;
    document.getElementById('taskProgress').value      = 0;
    document.getElementById('taskProgressLabel').textContent = '0%';
    document.getElementById('formChecklistList').innerHTML = '';
    populateSelects();
    buildResourcePicker([]);
    buildAreaPicker([]);
    buildProjectTypePicker(['SISTEMAS']);
    App.navigate('new-task');
  }

  /* ---- Abre formulário para EDIÇÃO ---- */
  function openEdit(id) {
    const task = Store.getTask(id);
    if (!task) return;

    currentEditId = id;
    document.getElementById('formTitle').textContent   = 'Editar Tarefa';
    document.getElementById('formTaskId').textContent  = task.id;
    document.getElementById('editTaskId').value        = task.id;

    populateSelects();

    document.getElementById('taskTitle').value        = task.title;
    document.getElementById('taskPriority').value     = task.priority;
    document.getElementById('taskIsCritical').checked = !!task.isCritical;
    document.getElementById('taskStatus').value       = task.status;
    document.getElementById('taskSolicitor').value    = task.solicitor;
    document.getElementById('taskDueDate').value      = task.dueDate || '';
    document.getElementById('taskDescription').value  = task.description || '';
    document.getElementById('taskNotes').value        = task.notes || '';

    const prog = task.progress || 0;
    document.getElementById('taskProgress').value = prog;
    document.getElementById('taskProgressLabel').textContent = prog + '%';

    buildChecklistForm(task.checklist || []);
    buildResourcePicker(task.resources || []);
    buildAreaPicker(task.area || []);
    buildProjectTypePicker(task.projectType || []);
    App.navigate('new-task');
  }

  /* ---- Validação ---- */
  function validate() {
    let ok = true;

    [
      { id: 'taskTitle'     },
      { id: 'taskStatus'    },
      { id: 'taskSolicitor' },
    ].forEach(({ id }) => {
      const el = document.getElementById(id);
      const valid = el.value.trim() !== '';
      el.classList.toggle('error', !valid);
      if (!valid) ok = false;
    });

    const prio = document.getElementById('taskPriority');
    const prioValid = prio.value !== '' && !isNaN(parseInt(prio.value)) && parseInt(prio.value) >= 0;
    prio.classList.toggle('error', !prioValid);
    if (!prioValid) ok = false;

    // Validate area
    const areas = getSelectedAreas();
    const areaPicker = document.getElementById('areaPicker');
    if (areas.length === 0) {
      areaPicker.style.border = '1px solid var(--danger)';
      ok = false;
    } else {
      areaPicker.style.border = 'none';
    }

    // Validate project type
    const pTypes = getSelectedProjectTypes();
    const pTypePicker = document.getElementById('projectTypePicker');
    if (pTypes.length === 0) {
      pTypePicker.style.border = '1px solid var(--danger)';
      ok = false;
    } else {
      pTypePicker.style.border = 'none';
    }

    return ok;
  }

  /* ---- Retorna checklist do formulário ---- */
  function getFormChecklist() {
    const items = document.querySelectorAll('#formChecklistList .checklist-item');
    return [...items].map(item => ({
      text: item.querySelector('.checklist-text').textContent,
      done: item.querySelector('.checklist-cb').checked,
    }));
  }

  /* ---- Constrói lista de checklist no formulário ---- */
  function buildChecklistForm(items = []) {
    const list = document.getElementById('formChecklistList');
    if (!list) return;
    list.innerHTML = items.map((item, idx) => `
      <div class="checklist-item" data-idx="${idx}">
        <label class="checklist-label ${item.done ? 'done' : ''}">
          <input type="checkbox" class="checklist-cb" ${item.done ? 'checked' : ''} />
          <span class="checklist-text">${escapeHtml(item.text)}</span>
        </label>
        <button type="button" class="checklist-remove" data-idx="${idx}" title="Remover">✕</button>
      </div>`).join('');

    list.querySelectorAll('.checklist-label').forEach(label => {
      const cb = label.querySelector('.checklist-cb');
      cb.addEventListener('change', () => label.classList.toggle('done', cb.checked));
    });
    list.querySelectorAll('.checklist-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const newItems = getFormChecklist().filter((_, i) => i !== Number(btn.dataset.idx));
        buildChecklistForm(newItems);
      });
    });
  }

  /* ---- Submit ---- */
  async function onSubmit(e) {
    e.preventDefault();
    if (!validate()) { UI.toast('Preencha os campos obrigatórios.', 'error'); return; }

    const btn = document.getElementById('submitForm');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const data = {
      title:       document.getElementById('taskTitle').value.trim(),
      priority:    parseInt(document.getElementById('taskPriority').value),
      status:      document.getElementById('taskStatus').value,
      area:        getSelectedAreas(),
      solicitor:   document.getElementById('taskSolicitor').value.trim(),
      dueDate:     document.getElementById('taskDueDate').value,
      description: document.getElementById('taskDescription').value.trim(),
      notes:       document.getElementById('taskNotes').value.trim(),
      resources:   getSelectedResources(),
      progress:    parseInt(document.getElementById('taskProgress').value) || 0,
      isCritical:  document.getElementById('taskIsCritical').checked,
      projectType: getSelectedProjectTypes(),
      checklist:   getFormChecklist(),
    };

    try {
      if (currentEditId) {
        await Store.updateTask(currentEditId, data);
        UI.toast('Tarefa atualizada com sucesso!', 'success');
      } else {
        await Store.addTask(data);
        UI.toast('Tarefa criada com sucesso!', 'success');
      }
      App.navigate('tv');
    } catch (err) {
      UI.toast('Erro ao salvar tarefa: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar Tarefa';
    }
  }

  /* ---- Init ---- */
  function init() {
    populateSelects();
    document.getElementById('taskForm').addEventListener('submit', onSubmit);
    document.getElementById('cancelForm').addEventListener('click', () => App.navigate('tv'));

    // Slider de progresso
    const progSlider = document.getElementById('taskProgress');
    const progLabel  = document.getElementById('taskProgressLabel');
    if (progSlider) {
      progSlider.addEventListener('input', () => {
        progLabel.textContent = progSlider.value + '%';
      });
    }

    // Adicionar item ao checklist
    const addBtn   = document.getElementById('formChecklistAdd');
    const addInput = document.getElementById('formChecklistInput');
    if (addBtn && addInput) {
      const addItem = () => {
        const text = addInput.value.trim();
        if (!text) return;
        const current = getFormChecklist();
        buildChecklistForm([...current, { text, done: false }]);
        addInput.value = '';
      };
      addBtn.addEventListener('click', addItem);
      addInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
    }

    ['taskTitle', 'taskPriority', 'taskStatus', 'taskSolicitor'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input',  () => el.classList.remove('error'));
      el.addEventListener('change', () => el.classList.remove('error'));
    });
  }

  return { init, openNew, openEdit };
})();
