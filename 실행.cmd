@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 모아 회의록 관리 시스템을 실행합니다.
echo 브라우저에서 http://localhost:3000 에 접속하세요.
node server.js
pause
