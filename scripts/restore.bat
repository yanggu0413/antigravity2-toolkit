@echo off
setlocal
chcp 65001 >nul 2>&1
title Antigravity 2 - 還原官方原版 (Restore Official Stock)
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 找不到 Node.js，請先安裝 Node.js！
    pause
    exit /b 1
)

echo.
echo ======================================================
echo  正在還原為官方原版 Antigravity (Restore Stock)
echo ======================================================
echo.
node "%~dp0..\bin\antigravity2-toolkit.js" --huifu %*

if errorlevel 1 (
    echo.
    echo [×] 還原失敗，請檢查上方訊息。
    pause
    exit /b 1
)

echo.
echo [√] 已成功還原為官方原版！
echo 按任意鍵關閉視窗...
pause >nul
endlocal
