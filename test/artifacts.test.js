import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { artifactInput, normalizeArtifactUrl } from '../public/artifact-model.js';

const source = (await readFile(new URL('../public/cloud.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const category = { id: 1, name: '기획', color: '#7762ca', count: 1 };
async function workspace() {
  const documents = new Map([
    ['users/team/workspace/config', { categories: [category, { id: 2, name: '개발', color: '#468b78', count: 0 }], nextMeetingId: 2, nextCategoryId: 3, version: 1 }],
    ['users/team/meetings/1', { id: 1, category_id: 1, title: '기존 회의', version: 1 }],
  ]);
  const snapshot = path => ({ exists: () => documents.has(path), data: () => structuredClone(documents.get(path)) });
  const context = {
    artifactInput, URL, TextEncoder, navigator: { onLine: true },
    firebaseConfig: { apiKey: 'test', projectId: 'test' }, initializeApp: () => ({}),
    getAuth: () => ({ currentUser: { uid: 'team' } }), getFirestore: () => ({}),
    setPersistence: async () => {}, browserSessionPersistence: {}, onAuthStateChanged: () => {},
    doc: (...parts) => parts.filter(part => typeof part === 'string').join('/'),
    collection: (...parts) => parts.filter(part => typeof part === 'string').join('/'),
    getDocFromServer: async path => snapshot(path),
    getDocsFromServer: async path => ({ docs: [...documents.keys()].filter(key => key.startsWith(`${path}/`)).map(snapshot) }),
    runTransaction: async (_, callback) => {
      const writes = [];
      const result = await callback({
        get: async path => snapshot(path),
        set: (path, value) => writes.push(() => documents.set(path, structuredClone(value))),
        update: (path, value) => writes.push(() => documents.set(path, { ...documents.get(path), ...structuredClone(value) })),
        delete: path => writes.push(() => documents.delete(path)),
      });
      writes.forEach(write => write());
      return result;
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.cloud = { request, initializeCloud, fetchWorkspace };`, context);
  await context.cloud.initializeCloud(() => {});
  return { ...context.cloud, documents, context, config: () => documents.get('users/team/workspace/config') };
}

test('web URLs normalize without allowing executable or local protocols', () => {
  assert.equal(normalizeArtifactUrl(' example.com/보고서?q=1&v=2 '), 'https://example.com/%EB%B3%B4%EA%B3%A0%EC%84%9C?q=1&v=2');
  assert.equal(normalizeArtifactUrl('http://intranet/report'), 'http://intranet/report');
  for (const url of ['', 'javascript:alert(1)', 'data:text/html,hello', 'file:///C:/report', 'https://', 'not a url', 'https://example.com/' + 'a'.repeat(4096)]) {
    assert.throws(() => normalizeArtifactUrl(url));
  }
  assert.throws(() => artifactInput({ category_id: 99, content: '문서', url: 'example.com' }, [category]));
  assert.throws(() => artifactInput({ category_id: 1, content: ' ', url: 'example.com' }, [category]));
  assert.throws(() => artifactInput({ category_id: 1, content: '가'.repeat(50001), url: 'example.com' }, [category]));
});

test('existing workspace supports artifact CRUD, category moves and deletion guards', async () => {
  const app = await workspace();
  const originalMeeting = structuredClone(app.documents.get('users/team/meetings/1'));
  const saved = await app.request('/api/artifacts', 'POST', { category_id: 1, content: '설계 산출물\n상세 내용', url: 'example.com/design' });
  assert.equal(saved.id, 1);
  assert.equal(saved.url, 'https://example.com/design');
  assert.equal(app.config().nextArtifactId, 2);
  assert.equal(app.config().categories[0].artifact_count, 1);
  const fetched = await app.fetchWorkspace();
  assert.equal(fetched.artifacts[0].category_name, '기획');
  assert.equal(fetched.categories[0].count, 1);
  assert.equal(fetched.categories[0].artifact_count, 1);
  const changed = await app.request('/api/artifacts/1', 'PUT', { ...saved, category_id: 2, content: '수정된 내용' });
  assert.equal(changed.version, 2);
  assert.equal(changed.created_at, saved.created_at);
  assert.equal(app.config().categories[0].artifact_count, 0);
  assert.equal(app.config().categories[1].artifact_count, 1);
  await assert.rejects(app.request('/api/categories/2', 'DELETE'), /산출물/);
  await app.request('/api/categories/2', 'PUT', { name: '개발 완료', color: '#112233' });
  assert.equal((await app.fetchWorkspace()).artifacts[0].category_name, '개발 완료');
  await app.request('/api/artifacts/1', 'DELETE', { version: changed.version });
  assert.equal((await app.fetchWorkspace()).artifacts.length, 0);
  assert.equal(app.config().categories[1].artifact_count, 0);
  await app.request('/api/categories/2', 'DELETE');
  assert.equal(app.config().categories.length, 1);
  assert.deepEqual(app.documents.get('users/team/meetings/1'), originalMeeting);
});

test('stale edits and deletes, invalid URLs, missing items and offline writes preserve data', async () => {
  const app = await workspace();
  const saved = await app.request('/api/artifacts', 'POST', { category_id: 2, content: '보고서', url: 'https://example.com' });
  await app.request('/api/artifacts/1', 'PUT', { ...saved, content: '다른 기기에서 수정' });
  await assert.rejects(app.request('/api/artifacts/1', 'PUT', { ...saved, content: '오래된 수정' }), /다른 기기/);
  await assert.rejects(app.request('/api/artifacts/1', 'DELETE', { version: saved.version }), /다른 기기/);
  const before = JSON.stringify([...app.documents]);
  await assert.rejects(app.request('/api/artifacts', 'POST', { category_id: 1, content: '문서', url: 'javascript:alert(1)' }), /http/);
  await assert.rejects(app.request('/api/artifacts/99', 'DELETE', { version: 1 }), /찾을 수/);
  app.context.navigator.onLine = false;
  await assert.rejects(app.request('/api/artifacts', 'POST', { category_id: 1, content: '문서', url: 'example.com' }), /인터넷/);
  assert.equal(JSON.stringify([...app.documents]), before);
});
