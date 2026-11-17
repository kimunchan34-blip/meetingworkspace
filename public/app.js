import { initializeCloud, login, logout, ensureWorkspace, fetchWorkspace, watchWorkspace, request, friendlyError } from './cloud.js';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  document: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  right: '<path d="m9 5 7 7-7 7"/>', left: '<path d="m15 5-7 7 7 7"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6zM13 6l5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
};
const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.document}</svg>`;
function hydrateIcons() { document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
let meetings = [], categories = [], selectedCategory = '', page = 1, toastTimer;
const pageSize = 7;
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateLabel = value => new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
function toast(message, error = false) {
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}
async function api(url, method = 'GET', body) {
  try { return await request(url, method, body); }
  catch (error) { throw new Error(friendlyError(error)); }
}
async function refresh() {
  applyWorkspace(await fetchWorkspace());
}
function applyWorkspace(data) {
  meetings = data.meetings;
  categories = data.categories;
  if (!categories.some(category => String(category.id) === selectedCategory)) selectedCategory = '';
  renderNav();
  renderList();
}
function renderNav() {
  $('#totalCount').textContent = meetings.length;
  $('#allMeetings').classList.toggle('active', !selectedCategory);
  $('#categoryNav').innerHTML = categories.map(category => `<button class="nav-item category-item ${selectedCategory === String(category.id) ? 'active' : ''}" data-category="${category.id}"><span class="category-dot" style="--category-color:${category.color}"></span><span class="category-name">${escapeHtml(category.name)}</span><span class="nav-count">${category.count}</span></button>`).join('');
  $('#categoryFilter').innerHTML = '<option value="">전체 카테고리</option>' + categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('');
  $('#categoryFilter').value = selectedCategory;
  const title = categories.find(category => String(category.id) === selectedCategory)?.name || '전체 회의록';
  $('#pageTitle').textContent = title;
  $('#breadcrumbTitle').textContent = title;
  const scope = meetings.filter(meeting => !selectedCategory || String(meeting.category_id) === selectedCategory);
  $('#statTotal').innerHTML = `${scope.length}<small>건</small>`;
  $('#statMonth').innerHTML = `${scope.filter(meeting => meeting.starts_at.startsWith(localDate().slice(0, 7))).length}<small>건</small>`;
  $('#statActions').innerHTML = `${scope.reduce((count, meeting) => count + meeting.actions.filter(action => !action.done).length, 0)}<small>개</small>`;
  $('#statCategories').innerHTML = `${categories.length}<small>개</small>`;
}
function filteredMeetings() {
  const query = $('#searchInput').value.trim().toLocaleLowerCase();
  const period = $('#periodFilter').value;
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
  return meetings.filter(meeting => {
    if (selectedCategory && String(meeting.category_id) !== selectedCategory) return false;
    const searchable = [meeting.title, meeting.attendees, meeting.discussion, meeting.notes, meeting.category_name, ...meeting.actions.map(action => `${action.text} ${action.owner}`)].join(' ').toLocaleLowerCase();
    if (query && !searchable.includes(query)) return false;
    const date = meeting.starts_at.slice(0, 10);
    if (period === 'month' && !date.startsWith(localDate().slice(0, 7))) return false;
    if (period === 'week' && (date < localDate(weekAgo) || date > localDate())) return false;
    if (period === 'custom' && (($('#fromDate').value && date < $('#fromDate').value) || ($('#toDate').value && date > $('#toDate').value))) return false;
    return true;
  }).sort((a, b) => $('#sortOrder').value === 'asc' ? a.starts_at.localeCompare(b.starts_at) || a.id - b.id : b.starts_at.localeCompare(a.starts_at) || b.id - a.id);
}
function renderList() {
  const filtered = filteredMeetings();
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.min(page, pageCount);
  $('#resultCount').textContent = filtered.length;
  $('#listSummary').textContent = `전체 ${filtered.length}개의 회의록${filtered.length ? ` · ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)}개 표시` : ''}`;
  $('#pageInfo').textContent = `${page} / ${pageCount}`;
  $('#prevPage').disabled = page === 1;
  $('#nextPage').disabled = page === pageCount;
  if (!filtered.length) {
    const hasFilter = selectedCategory || $('#searchInput').value || $('#periodFilter').value !== 'all';
    $('#meetingList').innerHTML = `<div class="empty-state"><div class="empty-art"><span class="empty-sheet">${icon('document')}<i></i><i></i></span><span class="empty-spark">+</span></div><h3>${hasFilter ? '조건에 맞는 회의록이 없어요' : '우리 팀의 첫 회의를 기록해 보세요'}</h3><p>${hasFilter ? '검색어나 카테고리, 조회 기간을 변경해 보세요.' : '회의의 논의 사항과 Action Item을 한 곳에 모아 관리하세요.'}</p><button class="button ${hasFilter ? '' : 'primary'}" id="emptyAction">${icon(hasFilter ? 'search' : 'plus')}${hasFilter ? '검색 조건 초기화' : '첫 회의록 작성하기'}</button><div class="empty-categories">${!hasFilter ? '추진반 · 부서내부 · P-DX · PI 프로젝트' : ''}</div></div>`;
    $('#emptyAction').onclick = () => hasFilter ? resetFilters() : openEditor();
    return;
  }
  $('#meetingList').innerHTML = `<div class="table-wrap"><table><thead><tr><th>회의 제목</th><th>회의 일시</th><th>참석자</th><th>Action Item</th><th aria-label="상세"></th></tr></thead><tbody>${filtered.slice((page - 1) * pageSize, page * pageSize).map(meeting => {
    const people = meeting.attendees.split(/[,，\n]/).map(person => person.trim()).filter(Boolean);
    const done = meeting.actions.filter(action => action.done).length;
    return `<tr><td><button class="meeting-link" data-meeting="${meeting.id}"><span class="category-badge" style="--category-color:${meeting.category_color}">${escapeHtml(meeting.category_name)}</span><strong>${escapeHtml(meeting.title)}</strong><span class="meeting-excerpt">${escapeHtml(meeting.discussion || '아직 논의 사항이 작성되지 않았습니다.')}</span></button></td><td class="date-cell">${escapeHtml(dateLabel(meeting.starts_at))}<small>${meeting.starts_at.slice(11, 16)}${meeting.ends_at ? ` – ${meeting.ends_at.slice(0, 10) !== meeting.starts_at.slice(0, 10) ? escapeHtml(dateLabel(meeting.ends_at)) + ' ' : ''}${meeting.ends_at.slice(11, 16)}` : ''}</small></td><td><span class="attendees-preview">${escapeHtml(people.slice(0, 2).join(', ') || '미입력')}</span>${people.length > 2 ? `<small class="muted">외 ${people.length - 2}명</small>` : ''}</td><td>${meeting.actions.length ? `<span class="action-count ${done === meeting.actions.length ? 'completed' : ''}">${icon('check')}${done} / ${meeting.actions.length}</span><div class="progress-track"><span style="width:${done / meeting.actions.length * 100}%"></span></div>` : '<span class="muted">—</span>'}</td><td><button class="icon-button" data-meeting="${meeting.id}" aria-label="${escapeHtml(meeting.title)} 상세 보기">${icon('right')}</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function resetFilters() {
  selectedCategory = ''; page = 1;
  $('#searchInput').value = ''; $('#periodFilter').value = 'all'; $('#dateRange').hidden = true;
  $('#fromDate').value = ''; $('#toDate').value = '';
  renderNav(); renderList();
}
function showDialog(id) { if (!$(`#${id}`).open) $(`#${id}`).showModal(); }
function confirmDelete(title, message) {
  $('#confirmTitle').textContent = title; $('#confirmMessage').textContent = message;
  showDialog('confirmDialog');
  return new Promise(resolve => {
    const dialog = $('#confirmDialog');
    const finish = result => { dialog.close(); dialog.oncancel = null; resolve(result); };
    $('#confirmCancel').onclick = () => finish(false);
    $('#confirmAccept').onclick = () => finish(true);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
  });
}
function actionRow(action = {}) {
  return `<div class="action-editor-row"><input type="checkbox" class="action-done" ${action.done ? 'checked' : ''} aria-label="완료 여부"><input class="action-text" placeholder="실행할 업무를 입력하세요" value="${escapeHtml(action.text)}" aria-label="Action Item 내용"><input class="action-owner" placeholder="담당자" value="${escapeHtml(action.owner)}" aria-label="담당자"><input class="action-due" type="date" value="${escapeHtml(action.due)}" aria-label="마감일"><button type="button" class="icon-button remove-action" aria-label="항목 삭제">${icon('close')}</button></div>`;
}
function openEditor(meeting = null) {
  if (!categories.length) { toast('먼저 회의 카테고리를 추가해 주세요.'); openCategories(); return; }
  const now = new Date();
  const start = `${localDate(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  $('#meetingDialogContent').innerHTML = `<div class="dialog-header"><div><div class="eyebrow">MEETING NOTE</div><h2>${meeting ? '회의록 수정' : '새 회의록 작성'}</h2></div><button class="icon-button" type="button" data-close="meetingDialog" aria-label="닫기">${icon('close')}</button></div><form id="meetingForm"><div class="form-body"><div class="form-grid"><label>회의 카테고리 <span class="required">*</span><select name="category_id" required>${categories.map(category => `<option value="${category.id}" ${String(category.id) === String(meeting?.category_id || selectedCategory) ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}</select></label><label class="span-two">회의 제목 <span class="required">*</span><input name="title" required maxlength="200" value="${escapeHtml(meeting?.title)}" placeholder="회의 제목을 입력하세요"></label><label>시작 일시 <span class="required">*</span><input name="starts_at" type="datetime-local" required value="${meeting?.starts_at || start}"></label><label>종료 일시<input name="ends_at" type="datetime-local" value="${meeting?.ends_at || ''}"></label><label class="span-two">참석자<input name="attendees" value="${escapeHtml(meeting?.attendees)}" placeholder="이름을 쉼표로 구분해 입력하세요. 예) 김민수, 이지현"></label></div><label class="form-section-label">논의 사항<textarea name="discussion" rows="6" placeholder="주요 안건과 논의 내용, 결정 사항을 기록해 주세요.">${escapeHtml(meeting?.discussion)}</textarea></label><div class="action-section-heading"><label>Action Item</label><button class="text-button" type="button" id="addAction">${icon('plus')}항목 추가</button></div><div class="action-column-labels"><span>완료</span><span>실행 업무</span><span>담당자</span><span>마감일</span></div><div id="actionRows">${(meeting?.actions.length ? meeting.actions : [{}]).map(actionRow).join('')}</div><label class="form-section-label">기타 내용<textarea name="notes" rows="3" placeholder="참고 사항이나 추가로 공유할 내용을 입력하세요.">${escapeHtml(meeting?.notes)}</textarea></label><p id="formError" class="form-error" role="alert"></p></div><div class="dialog-actions sticky-actions"><span class="field-hint"><span class="required">*</span> 필수 입력 항목</span><button class="button" type="button" data-close="meetingDialog">취소</button><button class="button primary" type="submit">${meeting ? '수정 사항 저장' : '회의록 등록'}</button></div></form>`;
  showDialog('meetingDialog');
  $('#addAction').onclick = () => $('#actionRows').insertAdjacentHTML('beforeend', actionRow());
  $('#actionRows').onclick = event => event.target.closest('.remove-action')?.closest('.action-editor-row').remove();
  $('#meetingForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    if (meeting) body.version = meeting.version;
    const rows = [...document.querySelectorAll('.action-editor-row')];
    if (rows.some(row => !row.querySelector('.action-text').value.trim() && (row.querySelector('.action-owner').value.trim() || row.querySelector('.action-due').value || row.querySelector('.action-done').checked))) {
      $('#formError').textContent = '담당자나 마감일을 지정한 Action Item의 업무 내용을 입력해 주세요.'; return;
    }
    body.actions = rows.map(row => ({ text: row.querySelector('.action-text').value, owner: row.querySelector('.action-owner').value, due: row.querySelector('.action-due').value, done: row.querySelector('.action-done').checked }));
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const saved = await api(`/api/meetings${meeting ? `/${meeting.id}` : ''}`, meeting ? 'PUT' : 'POST', body);
      const category = categories.find(item => item.id === saved.category_id);
      meetings = [...meetings.filter(item => item.id !== saved.id), { ...saved, category_name: category.name, category_color: category.color }];
      renderNav(); renderList(); openDetail(saved.id);
      toast(meeting ? '회의록을 수정했습니다.' : '새 회의록을 등록했습니다.');
    } catch (error) { $('#formError').textContent = error.message; button.disabled = false; }
  };
}
function openDetail(id) {
  const meeting = meetings.find(item => item.id === Number(id));
  if (!meeting) return;
  const done = meeting.actions.filter(action => action.done).length;
  $('#meetingDialogContent').innerHTML = `<div class="dialog-header detail-heading"><div><span class="category-badge" style="--category-color:${meeting.category_color}">${escapeHtml(meeting.category_name)}</span><h2>${escapeHtml(meeting.title)}</h2></div><button class="icon-button" data-close="meetingDialog" aria-label="닫기">${icon('close')}</button></div><div class="detail-meta"><span>${icon('calendar')}${escapeHtml(dateLabel(meeting.starts_at))}</span><span>${icon('clock')}${meeting.starts_at.slice(11, 16)}${meeting.ends_at ? ` – ${meeting.ends_at.slice(0, 10) !== meeting.starts_at.slice(0, 10) ? escapeHtml(dateLabel(meeting.ends_at)) + ' ' : ''}${meeting.ends_at.slice(11, 16)}` : ''}</span><span>${icon('people')}${escapeHtml(meeting.attendees || '참석자 미입력')}</span></div><div class="detail-body"><section><h3>논의 사항</h3><div class="prose ${!meeting.discussion ? 'muted' : ''}">${escapeHtml(meeting.discussion || '등록된 논의 사항이 없습니다.')}</div></section><section><h3>Action Item <span class="detail-action-count">${done} / ${meeting.actions.length} 완료</span></h3><div class="detail-action-list">${meeting.actions.length ? meeting.actions.map((action, index) => `<label class="detail-action ${action.done ? 'done' : ''}"><input type="checkbox" data-action="${index}" ${action.done ? 'checked' : ''}><span>${escapeHtml(action.text)}<small>${escapeHtml(action.owner || '담당자 미지정')}${action.due ? ` · ${escapeHtml(action.due)}까지` : ''}</small></span>${action.done ? '<em>완료</em>' : '<em class="pending">진행 중</em>'}</label>`).join('') : '<p class="muted">등록된 Action Item이 없습니다.</p>'}</div></section><section><h3>기타 내용</h3><div class="prose ${!meeting.notes ? 'muted' : ''}">${escapeHtml(meeting.notes || '등록된 기타 내용이 없습니다.')}</div></section></div><div class="dialog-actions sticky-actions"><button class="button danger-text" id="deleteMeeting">${icon('trash')}삭제</button><span class="action-spacer"></span><button class="button" data-close="meetingDialog">닫기</button><button class="button primary" id="editMeeting">${icon('edit')}수정하기</button></div>`;
  showDialog('meetingDialog');
  $('#editMeeting').onclick = () => openEditor(meeting);
  $('#deleteMeeting').onclick = async () => {
    if (!await confirmDelete('회의록을 삭제할까요?', `‘${meeting.title}’ 회의록과 Action Item이 삭제됩니다.`)) return;
    try {
      await api(`/api/meetings/${meeting.id}`, 'DELETE', { version: meeting.version });
      meetings = meetings.filter(item => item.id !== meeting.id);
      $('#meetingDialog').close(); renderNav(); renderList(); toast('회의록을 삭제했습니다.');
    } catch (error) { toast(error.message, true); }
  };
  document.querySelectorAll('[data-action]').forEach(input => { input.onchange = async () => {
    const actions = meeting.actions.map((action, index) => index === Number(input.dataset.action) ? { ...action, done: input.checked } : action);
    document.querySelectorAll('[data-action]').forEach(control => { control.disabled = true; });
    try { await api(`/api/meetings/${meeting.id}`, 'PUT', { ...meeting, actions }); await refresh(); openDetail(meeting.id); }
    catch (error) { toast(error.message, true); openDetail(meeting.id); }
  }; });
}
function renderCategoryEditor() {
  $('#categoryEditor').innerHTML = categories.map(category => `<form class="category-editor-row" data-category-edit="${category.id}"><input type="color" name="color" value="${category.color}" aria-label="${escapeHtml(category.name)} 색상"><input name="name" required maxlength="60" value="${escapeHtml(category.name)}" aria-label="카테고리 이름"><span class="muted category-meeting-count">${category.count}건</span><button class="icon-button" type="submit" aria-label="${escapeHtml(category.name)} 저장" title="저장">${icon('check')}</button><button class="icon-button category-delete" type="button" data-category-delete="${category.id}" aria-label="${escapeHtml(category.name)} 삭제" title="삭제">${icon('trash')}</button></form>`).join('');
}
function openCategories() { renderCategoryEditor(); showDialog('categoryDialog'); }
$('#categoryEditor').onsubmit = async event => {
  event.preventDefault();
  const form = event.target.closest('form');
  const button = form.querySelector('[type="submit"]'); button.disabled = true;
  try { await api(`/api/categories/${form.dataset.categoryEdit}`, 'PUT', Object.fromEntries(new FormData(form))); await refresh(); renderCategoryEditor(); toast('카테고리를 수정했습니다.'); } catch (error) { toast(error.message, true); button.disabled = false; }
};
$('#categoryEditor').onclick = async event => {
  const button = event.target.closest('[data-category-delete]'); if (!button) return;
  const category = categories.find(item => item.id === Number(button.dataset.categoryDelete));
  if (category.count) { toast('회의록의 카테고리를 먼저 변경한 후 삭제해 주세요.', true); return; }
  if (!await confirmDelete('카테고리를 삭제할까요?', `‘${category.name}’ 카테고리가 삭제됩니다.`)) return;
  try { await api(`/api/categories/${category.id}`, 'DELETE'); await refresh(); renderCategoryEditor(); toast('카테고리를 삭제했습니다.'); } catch (error) { toast(error.message, true); }
};
$('#categoryForm').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); button.disabled = true;
  try { await api('/api/categories', 'POST', Object.fromEntries(new FormData(form))); form.reset(); await refresh(); renderCategoryEditor(); toast('카테고리를 추가했습니다.'); } catch (error) { toast(error.message, true); } finally { button.disabled = false; }
};
document.addEventListener('click', event => {
  const close = event.target.closest('[data-close]');
  if (close) $(`#${close.dataset.close}`).close();
  const category = event.target.closest('[data-category]');
  if (category) { selectedCategory = category.dataset.category; page = 1; renderNav(); renderList(); }
  const meeting = event.target.closest('[data-meeting]');
  if (meeting) openDetail(meeting.dataset.meeting);
});
$('#newMeeting').onclick = () => openEditor();
$('#allMeetings').onclick = () => { selectedCategory = ''; page = 1; renderNav(); renderList(); };
$('#manageCategories').onclick = openCategories;
$('#addCategory').onclick = openCategories;
$('#categoryFilter').onchange = event => { selectedCategory = event.target.value; page = 1; renderNav(); renderList(); };
['searchInput', 'sortOrder', 'fromDate', 'toDate'].forEach(id => { $(`#${id}`).addEventListener('input', () => { page = 1; renderList(); }); });
$('#periodFilter').onchange = () => { $('#dateRange').hidden = $('#periodFilter').value !== 'custom'; page = 1; renderList(); };
$('#resetDates').onclick = () => { $('#fromDate').value = ''; $('#toDate').value = ''; page = 1; renderList(); };
$('#prevPage').onclick = () => { page--; renderList(); };
$('#nextPage').onclick = () => { page++; renderList(); };
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('#searchInput').focus(); } });
$('#todayLabel').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
hydrateIcons();
let stopWatching = () => {};
let authGeneration = 0;
$('#loginButton').onclick = async () => {
  $('#loginButton').disabled = true;
  $('#authMessage').textContent = 'Google 로그인 창에서 계정을 선택해 주세요.';
  try { await login(); }
  catch (error) { $('#authMessage').textContent = friendlyError(error); }
  finally { $('#loginButton').disabled = false; }
};
$('#logoutButton').onclick = async () => {
  try { await logout(); } catch (error) { toast(friendlyError(error), true); }
};
function connectionState(online) {
  $('#connectionLabel').textContent = online && navigator.onLine ? '클라우드 동기화됨' : '클라우드 연결 확인 중';
  $('#connectionDot').classList.toggle('offline', !online || !navigator.onLine);
}
window.addEventListener('offline', () => connectionState(false));
window.addEventListener('online', () => connectionState(false));
try {
  await initializeCloud(async user => {
    const generation = ++authGeneration;
    stopWatching();
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    meetings = []; categories = [];
    $('#workspaceApp').hidden = true;
    $('#authScreen').hidden = false;
    $('#loginButton').disabled = false;
    if (!user) { $('#authMessage').textContent = '회의록은 계정별로 안전하게 보관됩니다.'; return; }
    $('#authMessage').textContent = '저장된 회의록을 불러오고 있습니다…';
    try {
      await ensureWorkspace();
      if (generation !== authGeneration) return;
      await refresh();
      if (generation !== authGeneration) return;
      $('#accountLabel').textContent = user.email || user.displayName;
      $('#authScreen').hidden = true;
      $('#workspaceApp').hidden = false;
      stopWatching = watchWorkspace(data => { if (generation === authGeneration) applyWorkspace(data); }, error => { connectionState(false); toast(friendlyError(error), true); }, connectionState);
    } catch (error) { $('#authMessage').textContent = friendlyError(error); }
  });
} catch (error) {
  $('#authMessage').textContent = friendlyError(error);
  $('#loginButton').disabled = true;
}
