@echo off
chcp 65001 >nul
title Antigravity - 卸载还原官方英文

echo.
echo ======================================================
echo  正在卸载本地化与自定义样式，恢复官方英文原版...
echo ======================================================
echo.

cd /d "%~dp0"
node bin/antigravity2-toolkit.js restore %*

if %errorlevel% neq 0 (
    echo.
    echo [×] 还原失败，请检查上方错误信息。
    pause
    exit /b 1
)

echo.
echo [√] 还原完成！已恢复为官方原版状态。
echo 窗口将在 5 秒后自动关闭...
timeout /t 5 >nul
