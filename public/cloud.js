import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import { getFirestore, doc, collection, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

let auth, db;
export const workspaceAccountEmail = 'workspace-access@meetingworkspace.invalid';
const defaultNames = ['추진반 회의', '부서내부 회의', 'P-DX 회의', 'PI 데이터거버넌스', 'PI 데이터레이크하우스', 'PI MDM', 'PI ODM'];
const defaultColors = ['#7762ca', '#468b78', '#5083c6', '#d39343', '#5b9fa7', '#b56c91', '#75839a'];
function references() {
  if (!auth?.currentUser) throw new Error('계정으로 로그인해 주세요.');
  const userId = auth.currentUser.uid;
  return { config: doc(db, 'users', userId, 'workspace', 'config'), meetings: collection(db, 'users', userId, 'meetings') };
}
export function friendlyError(error) {
  const messages = {
    'auth/invalid-credential': '접속 비밀번호가 올바르지 않습니다.',
    'auth/wrong-password': '접속 비밀번호가 올바르지 않습니다.',
    'auth/user-not-found': '접속 계정을 찾을 수 없습니다. 관리자에게 문의해 주세요.',
    'auth/too-many-requests': '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    'auth/user-disabled': '사용이 중지된 계정입니다. 관리자에게 문의해 주세요.',
    'auth/unauthorized-domain': '이 주소에서 로그인할 수 없습니다. Firebase 인증 도메인 설정을 확인해 주세요.',
    'auth/operation-not-allowed': '접속 기능을 사용할 수 없습니다. 관리자에게 문의해 주세요.',
    'auth/configuration-not-found': 'Firebase Authentication 설정이 필요합니다.',
    'auth/network-request-failed': '네트워크 연결을 확인한 후 다시 시도해 주세요.',
    'permission-denied': '회의록 접근 권한을 확인할 수 없습니다. 다시 로그인해 주세요.',
    'unavailable': '클라우드에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.',
  };
  return messages[error.code] || error.message || '요청을 처리할 수 없습니다.';
}
export async function initializeCloud(onUser) {
  if (!firebaseConfig?.apiKey || !firebaseConfig?.projectId) throw new Error('Firebase 프로젝트 연결을 준비하고 있습니다. 관리자에게 연결 상태를 확인해 주세요.');
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app); db = getFirestore(app);
  await setPersistence(auth, browserSessionPersistence);
  auth.languageCode = 'ko';
  onAuthStateChanged(auth, onUser);
}
export async function login(pin) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`meetingworkspace:${pin}`));
  const password = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return signInWithEmailAndPassword(auth, workspaceAccountEmail, password);
}
export function logout() { return signOut(auth); }
export async function ensureWorkspace() {
  const { config } = references();
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(config);
    if (snapshot.exists()) return;
    transaction.set(config, {
      categories: defaultNames.map((name, index) => ({ id: index + 1, name, color: defaultColors[index], count: 0 })),
      nextMeetingId: 1, nextCategoryId: 8, version: 1,
    });
  });
}
function combine(config, documents) {
  const categories = (config?.categories || []).map(category => ({ ...category, count: 0 }));
  const meetings = documents.map(snapshot => {
    const meeting = snapshot.data();
    const category = categories.find(item => item.id === meeting.category_id);
    if (category) category.count++;
    return { ...meeting, category_name: category?.name || '미분류', category_color: category?.color || '#75839a' };
  });
  return { meetings, categories };
}
export async function fetchWorkspace() {
  const refs = references();
  const [config, meetings] = await Promise.all([getDocFromServer(refs.config), getDocsFromServer(refs.meetings)]);
  return combine(config.data(), meetings.docs);
}
export function watchWorkspace(onData, onError, onConnection) {
  const refs = references();
  let config, documents, configOnline = false, meetingsOnline = false;
  const emit = () => {
    onConnection(configOnline && meetingsOnline);
    if (config && documents) onData(combine(config, documents));
  };
  const stopConfig = onSnapshot(refs.config, { includeMetadataChanges: true }, snapshot => { config = snapshot.data(); configOnline = !snapshot.metadata.fromCache; emit(); }, onError);
  const stopMeetings = onSnapshot(refs.meetings, { includeMetadataChanges: true }, snapshot => { documents = snapshot.docs; meetingsOnline = !snapshot.metadata.fromCache; emit(); }, onError);
  return () => { stopConfig(); stopMeetings(); };
}
function categoryInput(body) {
  const name = String(body.name || '').trim();
  if (!name || name.length > 60) throw new Error('카테고리 이름을 1~60자로 입력해 주세요.');
  return { name, color: /^#[a-f\d]{6}$/i.test(body.color) ? body.color : '#7762ca' };
}
function validDate(value, withTime = false) {
  const pattern = withTime ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && (withTime ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` === value : date.toISOString().slice(0, 10) === value);
}
function meetingInput(body, categories) {
  const title = String(body.title || '').trim();
  if (!title || title.length > 200) throw new Error('회의 제목을 1~200자로 입력해 주세요.');
  const categoryId = Number(body.category_id);
  if (!categories.some(category => category.id === categoryId)) throw new Error('카테고리를 선택해 주세요.');
  if (!validDate(body.starts_at, true)) throw new Error('회의 시작 시간을 확인해 주세요.');
  const end = body.ends_at || '';
  if (end && (!validDate(end, true) || end < body.starts_at)) throw new Error('종료 시간은 시작 시간 이후로 설정해 주세요.');
  if (!Array.isArray(body.actions) || body.actions.length > 200) throw new Error('Action Item은 200개까지 등록할 수 있습니다.');
  const actions = body.actions.map(action => ({ text: String(action.text || '').trim(), owner: String(action.owner || '').trim(), due: String(action.due || ''), done: Boolean(action.done) })).filter(action => action.text);
  if (actions.some(action => action.text.length > 2000 || action.owner.length > 200 || (action.due && !validDate(action.due)))) throw new Error('Action Item 내용과 마감일을 확인해 주세요.');
  const result = { title, category_id: categoryId, starts_at: body.starts_at, ends_at: end, attendees: String(body.attendees || '').trim(), discussion: String(body.discussion || '').trim(), notes: String(body.notes || '').trim(), actions };
  if (result.attendees.length > 5000 || result.discussion.length > 100000 || result.notes.length > 50000 || new TextEncoder().encode(JSON.stringify(result)).length > 800000) throw new Error('회의록 내용이 너무 큽니다. 내용을 줄여 주세요.');
  return result;
}
export async function request(url, method = 'GET', body) {
  const match = url.match(/^\/api\/(categories|meetings)(?:\/(\d+))?$/);
  if (!match) throw new Error('요청한 기능을 찾을 수 없습니다.');
  const [, resource, idText] = match;
  const id = idText ? Number(idText) : null;
  const refs = references();
  if (method === 'GET') {
    const data = await fetchWorkspace();
    return id === null ? data[resource] : data[resource].find(item => item.id === id);
  }
  if (!navigator.onLine) throw new Error('인터넷 연결 후 저장해 주세요. 입력한 내용은 현재 창에 유지됩니다.');
  return runTransaction(db, async transaction => {
    const configSnapshot = await transaction.get(refs.config);
    if (!configSnapshot.exists()) throw new Error('워크스페이스를 찾을 수 없습니다. 다시 로그인해 주세요.');
    const config = configSnapshot.data();
    const categories = config.categories.map(category => ({ ...category }));
    if (resource === 'categories') {
      const index = categories.findIndex(category => category.id === id);
      if (id !== null && index < 0) throw new Error('카테고리를 찾을 수 없습니다.');
      if (method === 'DELETE') {
        if (categories[index].count > 0) throw new Error('회의록의 카테고리를 먼저 변경한 후 삭제해 주세요.');
        categories.splice(index, 1);
      } else {
        const input = categoryInput(body);
        if (categories.some(category => category.id !== id && category.name === input.name)) throw new Error('이미 등록된 카테고리 이름입니다.');
        if (method === 'POST') {
          if (categories.length >= 100) throw new Error('카테고리는 100개까지 등록할 수 있습니다.');
          categories.push({ ...input, id: config.nextCategoryId, count: 0 });
        } else categories[index] = { ...categories[index], ...input };
      }
      transaction.update(refs.config, { categories, nextCategoryId: config.nextCategoryId + (method === 'POST' ? 1 : 0), version: config.version + 1 });
      return { ok: true };
    }
    const meetingRef = doc(refs.meetings, String(method === 'POST' ? config.nextMeetingId : id));
    const snapshot = await transaction.get(meetingRef);
    const existing = snapshot.exists() ? snapshot.data() : null;
    if (method !== 'POST' && !existing) throw new Error('회의록을 찾을 수 없습니다.');
    if (existing && existing.version !== body.version) throw new Error('다른 기기에서 회의록이 변경되었습니다. 목록에서 회의록을 다시 열어 확인해 주세요.');
    if (method === 'DELETE') {
      categories.find(item => item.id === existing.category_id).count--;
      transaction.delete(meetingRef);
      transaction.update(refs.config, { categories, version: config.version + 1 });
      return { ok: true };
    }
    const input = meetingInput(body, categories);
    if (existing && existing.category_id !== input.category_id) categories.find(category => category.id === existing.category_id).count--;
    if (!existing || existing.category_id !== input.category_id) categories.find(category => category.id === input.category_id).count++;
    const now = new Date().toISOString();
    const meeting = { ...input, id: existing?.id || config.nextMeetingId, created_at: existing?.created_at || now, updated_at: now, version: (existing?.version || 0) + 1 };
    transaction.set(meetingRef, meeting);
    transaction.update(refs.config, { categories, nextMeetingId: config.nextMeetingId + (method === 'POST' ? 1 : 0), version: config.version + 1 });
    return meeting;
  });
}
