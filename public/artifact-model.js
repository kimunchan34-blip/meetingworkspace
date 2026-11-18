export const MAX_ARTIFACT_LINKS = 50;

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
  const inputLinks = Object.hasOwn(body, 'links') ? body.links : artifactLinks(body);
  if (!Array.isArray(inputLinks) || !inputLinks.length || inputLinks.length > MAX_ARTIFACT_LINKS) {
    throw new Error(`산출물명과 URL은 1~${MAX_ARTIFACT_LINKS}개까지 등록할 수 있습니다.`);
  }
  const links = inputLinks.map((link, index) => {
    try {
      const name = String(link?.name || '').trim();
      if (!name || name.length > 200) throw new Error('산출물명을 1~200자로 입력해 주세요.');
      return { name, url: normalizeArtifactUrl(link?.url) };
    } catch (error) {
      throw new Error(`${index + 1}번째 산출물: ${error.message}`);
    }
  });
  return { category_id: categoryId, content, links, url: links[0].url };
}

export function artifactLinks(artifact) {
  if (Array.isArray(artifact?.links)) return artifact.links.filter(link => link && typeof link.name === 'string' && typeof link.url === 'string');
  return artifact?.url ? [{ name: '기존 산출물', url: artifact.url }] : [];
}
