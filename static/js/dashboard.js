const state = {
  subjects: [],
  tasks: [],
  analytics: null,
  focusSubjectId: null,
  charts: {},
};

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.detail;
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail[0]?.msg || 'Please check the form and try again.'
        : detail?.message || 'Something went wrong.';
    const error = new Error(message);
    error.detail = detail;
    error.status = response.status;
    throw error;
  }
  return body;
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $('#toast-region').append(toast);
  setTimeout(() => toast.remove(), 3200);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayOffset(date) {
  const due = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86400000);
}

function formatDue(task) {
  const due = new Date(task.due_at);
  const offset = dayOffset(due);
  let label;
  if (offset === 0) label = 'Today';
  else if (offset === 1) label = 'Tomorrow';
  else if (offset === -1) label = 'Yesterday';
  else label = due.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const time = due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${label} · ${time}`;
}

function toDatetimeLocal(iso) {
  const date = new Date(iso);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultDueTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return toDatetimeLocal(date.toISOString());
}

function taskCard(task) {
  const urgentBadge = task.state === 'urgent' ? '<span class="state-badge">Due soon</span>' : '';
  const overdueBadge = task.state === 'overdue' ? '<span class="state-badge">Overdue</span>' : '';
  const description = task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : '';
  return `
    <article class="task-card state-${task.state}" data-task-id="${task.id}">
      <input class="task-check" type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Mark ${escapeHtml(task.title)} ${task.completed ? 'incomplete' : 'complete'}" data-action="toggle-task">
      <div class="task-content">
        <div class="task-title-row">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <span class="priority-badge priority-${task.priority}">${task.priority}</span>
          ${urgentBadge}${overdueBadge}
        </div>
        <div class="task-meta">
          <span class="task-subject"><i class="subject-dot" style="background:${task.subject.color}"></i>${escapeHtml(task.subject.name)}</span>
          <span>${formatDue(task)}</span>
        </div>
        ${description}
      </div>
      <div class="task-actions">
        <button class="task-action" data-action="edit-task" aria-label="Edit ${escapeHtml(task.title)}" title="Edit">✎</button>
        <button class="task-action delete" data-action="delete-task" aria-label="Delete ${escapeHtml(task.title)}" title="Delete">×</button>
      </div>
    </article>`;
}

function groupTasks(tasks) {
  const groups = { today: [], overdue: [], upcoming: [], later: [], completed: [] };
  tasks.forEach((task) => {
    if (task.completed) {
      groups.completed.push(task);
      return;
    }
    const due = new Date(task.due_at);
    const offset = dayOffset(due);
    if (task.state === 'overdue') groups.overdue.push(task);
    else if (dateKey(due) === dateKey(new Date())) groups.today.push(task);
    else if (offset >= 1 && offset <= 7) groups.upcoming.push(task);
    else groups.later.push(task);
  });
  groups.completed.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
  return groups;
}

function renderTaskGroups() {
  const filtered = state.focusSubjectId
    ? state.tasks.filter((task) => task.subject_id === state.focusSubjectId)
    : state.tasks;
  const groups = groupTasks(filtered);
  Object.entries(groups).forEach(([name, tasks]) => {
    const list = $(`#${name}-list`);
    list.innerHTML = tasks.map(taskCard).join('');
    $(`#${name}-empty`).hidden = tasks.length > 0;
    $(`#${name}-count`).textContent = tasks.length;
  });
  $('#task-sections').hidden = state.subjects.length === 0;
  $('#empty-dashboard').hidden = state.subjects.length > 0;
}

function renderSubjects() {
  const list = $('#subject-list');
  list.innerHTML = state.subjects.map((subject) => `
    <div class="subject-row ${state.focusSubjectId === subject.id ? 'active' : ''}" data-subject-id="${subject.id}">
      <button class="subject-filter" data-action="focus-subject" title="Focus on ${escapeHtml(subject.name)}">
        <i class="subject-dot" style="background:${subject.color}"></i>
        <span>${escapeHtml(subject.name)}</span>
        <span class="subject-task-count">${subject.task_count}</span>
      </button>
      <button class="subject-menu" data-action="edit-subject" aria-label="Edit ${escapeHtml(subject.name)}" title="Edit subject">•••</button>
    </div>`).join('');
  $('#subject-empty').hidden = state.subjects.length > 0;
  $('#all-count').textContent = state.tasks.length;
  $('#overdue-count').textContent = state.analytics?.summary.overdue || 0;
  const activeSubject = state.subjects.find((subject) => subject.id === state.focusSubjectId);
  $('#focus-label').textContent = activeSubject ? `Focused on ${activeSubject.name}` : 'All subjects';
  $('#dashboard-subtitle').textContent = activeSubject
    ? `A clear view of everything moving in ${activeSubject.name}.`
    : 'Here is what deserves your attention today.';
}

function renderSummary() {
  const summary = state.analytics?.summary;
  if (!summary) return;
  $('#stat-today').textContent = summary.due_today;
  $('#stat-upcoming').textContent = summary.due_next_7_days;
  $('#stat-overdue').textContent = summary.overdue;
  $('#stat-completed').textContent = summary.completed;
  $('#completion-value').textContent = `${summary.completion_rate}%`;
  $('#completion-ring').style.setProperty('--progress', summary.completion_rate);
  $('#chart-completion').textContent = `${summary.completion_rate}%`;
}

function chartDefaults() {
  if (!window.Chart) return;
  Chart.defaults.font.family = 'Outfit, Segoe UI, sans-serif';
  Chart.defaults.color = '#78716C';
  Chart.defaults.borderColor = 'rgba(41, 37, 36, 0.07)';
}

function upsertChart(name, elementId, config) {
  if (!window.Chart) return;
  if (state.charts[name]) state.charts[name].destroy();
  state.charts[name] = new Chart($(`#${elementId}`), config);
}

function renderCharts() {
  if (!state.analytics || !window.Chart) return;
  const analytics = state.analytics;
  const noAnimation = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const common = { responsive: true, maintainAspectRatio: false, animation: noAnimation ? false : undefined };
  upsertChart('trend', 'trend-chart', {
    type: 'line',
    data: {
      labels: analytics.weekly_completion.map((point) => point.label),
      datasets: [{ data: analytics.weekly_completion.map((point) => point.completed), borderColor: '#F38F88', backgroundColor: 'rgba(255,183,178,.16)', fill: true, tension: .38, pointBackgroundColor: '#F38F88', pointRadius: 4, borderWidth: 2.5 }],
    },
    options: { ...common, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { drawBorder: false } }, x: { grid: { display: false } } } },
  });
  const status = analytics.status_distribution;
  upsertChart('status', 'status-chart', {
    type: 'doughnut',
    data: { labels: ['Completed', 'Pending', 'Overdue'], datasets: [{ data: [status.completed, status.pending, status.overdue], backgroundColor: ['#A9C9AC', '#C9C3E6', '#E5948E'], borderWidth: 0, hoverOffset: 4 }] },
    options: { ...common, cutout: '72%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, padding: 16 } } } },
  });
  const workload = analytics.subject_workload;
  upsertChart('subject', 'subject-chart', {
    type: 'bar',
    data: { labels: workload.map((item) => item.name), datasets: [{ data: workload.map((item) => item.task_count), backgroundColor: workload.map((item) => item.color), borderRadius: 10, borderSkipped: false, maxBarThickness: 48 }] },
    options: { ...common, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { drawBorder: false } }, x: { grid: { display: false } } } },
  });
  const total = analytics.weekly_completion.reduce((sum, point) => sum + point.completed, 0);
  $('#trend-total').textContent = `${total} finished`;
}

function renderAll() {
  renderSubjects();
  renderTaskGroups();
  renderSummary();
  renderCharts();
}

async function refreshData() {
  try {
    const [subjects, tasks, analytics] = await Promise.all([
      api('/api/subjects'),
      api('/api/tasks'),
      api(`/api/analytics/dashboard?timezone=${encodeURIComponent(timezone)}`),
    ]);
    state.subjects = subjects;
    state.tasks = tasks;
    state.analytics = analytics;
    if (state.focusSubjectId && !subjects.some((subject) => subject.id === state.focusSubjectId)) state.focusSubjectId = null;
    renderAll();
  } catch (error) {
    showToast(`Could not load Zejora: ${error.message}`, 'error');
  }
}

function populateSubjectSelect(selectedId) {
  $('#task-subject').innerHTML = state.subjects.map((subject) => `<option value="${subject.id}" ${subject.id === selectedId ? 'selected' : ''}>${escapeHtml(subject.name)}</option>`).join('');
}

function openSubjectModal(subject = null) {
  $('#subject-form').reset();
  $('#subject-error').textContent = '';
  $('#subject-id').value = subject?.id || '';
  $('#subject-name').value = subject?.name || '';
  $('#subject-modal-title').textContent = subject ? 'Edit subject' : 'Add a subject';
  $('#delete-subject-button').hidden = !subject;
  const color = subject?.color || '#FFB7B2';
  const colorInput = $(`input[name="color"][value="${color}"]`);
  if (colorInput) colorInput.checked = true;
  $('#subject-modal').showModal();
  setTimeout(() => $('#subject-name').focus(), 50);
}

function openTaskModal(task = null) {
  if (!state.subjects.length) {
    showToast('Create a subject before adding a task.', 'error');
    openSubjectModal();
    return;
  }
  $('#task-form').reset();
  $('#task-error').textContent = '';
  $('#task-id').value = task?.id || '';
  $('#task-title').value = task?.title || '';
  $('#task-description').value = task?.description || '';
  $('#task-due').value = task ? toDatetimeLocal(task.due_at) : defaultDueTime();
  $('#task-modal-title').textContent = task ? 'Edit task' : 'Add a task';
  const subjectId = task?.subject_id || state.focusSubjectId || state.subjects[0].id;
  populateSubjectSelect(subjectId);
  $(`input[name="priority"][value="${task?.priority || 'medium'}"]`).checked = true;
  $('#task-modal').showModal();
  setTimeout(() => $('#task-title').focus(), 50);
}

function confirmAction({ title, message, acceptLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    const modal = $('#confirm-modal');
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    $('#confirm-accept').textContent = acceptLabel;
    $('#confirm-accept').className = `button ${danger ? 'button-danger' : 'button-primary'}`;
    const finish = (value) => {
      modal.close();
      resolve(value);
    };
    $('#confirm-cancel').onclick = () => finish(false);
    $('#confirm-accept').onclick = () => finish(true);
    modal.oncancel = (event) => { event.preventDefault(); finish(false); };
    modal.showModal();
  });
}

async function saveSubject(event) {
  event.preventDefault();
  const id = $('#subject-id').value;
  const payload = { name: $('#subject-name').value, color: $('input[name="color"]:checked').value };
  try {
    await api(id ? `/api/subjects/${id}` : '/api/subjects', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    $('#subject-modal').close();
    showToast(id ? 'Subject updated.' : 'Subject created.');
    await refreshData();
  } catch (error) {
    $('#subject-error').textContent = error.message;
  }
}

async function saveTask(event) {
  event.preventDefault();
  const id = $('#task-id').value;
  const localDue = $('#task-due').value;
  const dueDate = new Date(localDue);
  if (!localDue || Number.isNaN(dueDate.getTime())) {
    $('#task-error').textContent = 'Choose a valid due date and time.';
    return;
  }
  const payload = {
    title: $('#task-title').value,
    description: $('#task-description').value || null,
    subject_id: Number($('#task-subject').value),
    due_at: dueDate.toISOString(),
    priority: $('input[name="priority"]:checked').value,
  };
  try {
    await api(id ? `/api/tasks/${id}` : '/api/tasks', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    $('#task-modal').close();
    showToast(id ? 'Task updated.' : 'Task added.');
    await refreshData();
  } catch (error) {
    $('#task-error').textContent = error.message;
  }
}

async function deleteSubject(subject) {
  const taskWord = subject.task_count === 1 ? 'task' : 'tasks';
  const message = subject.task_count
    ? `${subject.name} contains ${subject.task_count} ${taskWord}. Deleting it will permanently delete them too.`
    : `Delete ${subject.name}? This cannot be undone.`;
  const confirmed = await confirmAction({ title: `Delete ${subject.name}?`, message });
  if (!confirmed) return;
  try {
    await api(`/api/subjects/${subject.id}?cascade=true`, { method: 'DELETE' });
    $('#subject-modal').close();
    showToast('Subject deleted.');
    await refreshData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function toggleTask(task, completed) {
  try {
    await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ completed }) });
    showToast(completed ? 'Task complete. Nice work.' : 'Task reopened.');
    await refreshData();
  } catch (error) {
    showToast(error.message, 'error');
    await refreshData();
  }
}

async function deleteTask(task) {
  const confirmed = await confirmAction({ title: 'Delete this task?', message: `${task.title} will be permanently removed.` });
  if (!confirmed) return;
  try {
    await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
    showToast('Task deleted.');
    await refreshData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebar-scrim').classList.remove('open');
}

function setGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  $('#dashboard-title').textContent = greeting;
  $('#date-label').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

document.addEventListener('click', async (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;
  const taskElement = actionTarget.closest('[data-task-id]');
  const subjectElement = actionTarget.closest('[data-subject-id]');
  const task = taskElement ? state.tasks.find((item) => item.id === Number(taskElement.dataset.taskId)) : null;
  const subject = subjectElement ? state.subjects.find((item) => item.id === Number(subjectElement.dataset.subjectId)) : null;
  if (action === 'add-subject') openSubjectModal();
  if (action === 'add-task') openTaskModal();
  if (action === 'edit-task') openTaskModal(task);
  if (action === 'delete-task') await deleteTask(task);
  if (action === 'toggle-task') await toggleTask(task, actionTarget.checked);
  if (action === 'edit-subject') openSubjectModal(subject);
  if (action === 'focus-subject') {
    state.focusSubjectId = state.focusSubjectId === subject.id ? null : subject.id;
    renderSubjects();
    renderTaskGroups();
    closeSidebar();
  }
});

$('#subject-form').addEventListener('submit', saveSubject);
$('#task-form').addEventListener('submit', saveTask);
$('#add-subject-button').addEventListener('click', () => openSubjectModal());
$('#header-add-subject').addEventListener('click', () => openSubjectModal());
$('#add-task-button').addEventListener('click', () => openTaskModal());
$('#delete-subject-button').addEventListener('click', () => {
  const subject = state.subjects.find((item) => item.id === Number($('#subject-id').value));
  if (subject) deleteSubject(subject);
});
$('#open-sidebar').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebar-scrim').classList.add('open'); });
$('#close-sidebar').addEventListener('click', closeSidebar);
$('#sidebar-scrim').addEventListener('click', closeSidebar);
$$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
$$('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
  $(`#${button.dataset.scroll}-section`).scrollIntoView({ behavior: 'smooth' });
  closeSidebar();
}));
$('.nav-item[data-view="all"]').addEventListener('click', () => {
  state.focusSubjectId = null;
  renderSubjects();
  renderTaskGroups();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebar();
});

setGreeting();
chartDefaults();
refreshData();
