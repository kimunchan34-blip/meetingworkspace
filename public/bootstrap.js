try {
  await import('./app.js');
} catch (error) {
  document.querySelector('#authMessage').textContent = '클라우드 연결 모듈을 불러오지 못했습니다. 인터넷 연결을 확인한 후 새로고침해 주세요.';
  document.querySelector('#loginButton').disabled = true;
  console.error(error);
}
