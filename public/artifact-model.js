export function normalizeArtifactUrl(value) {
  const input = String(value || '').trim();
  if (!input || input.length > 4096 || /\s/.test(input)) throw new Error('산출물 URL 주소를 확인해 주세요.');
  const address = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  let url;
  try { url = new URL(address); } catch { throw new Error('올바른 산출물 URL 주소를 입력해 주세요.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('http 또는 https로 시작하는 URL 주소를 입력해 주세요.');
  if (url.href.length > 4096) throw new Error('산출물 URL 주소는 4,096자까지 입력할 수 있습니다.');
  return url.href;
}

export function artifactInput(body, categories) {
  const categoryId = Number(body.category_id);
  if (!categories.some(category => category.id === categoryId)) throw new Error('카테고리를 선택해 주세요.');
  const content = String(body.content || '').trim();
  if (!content || content.length > 50000) throw new Error('산출물의 내용을 1~50,000자로 입력해 주세요.');
  return { category_id: categoryId, content, url: normalizeArtifactUrl(body.url) };
}
