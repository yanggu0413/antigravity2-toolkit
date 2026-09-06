@echo off
setlocal
chcp 65001 >nul 2>&1
title Antigravity 2 全能增強工具箱
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo ========================================================
    echo [錯誤] 系統未安裝或找不到 Node.js！
    echo 請前往 https://nodejs.org 下載安裝後再重試。
    echo ========================================================
    echo.
    pause
    exit /b 1
)

node "%~dp0bin\antigravity2-toolkit.js" %*

if errorlevel 1 (
    echo.
    echo ========================================================
    echo 執行異常結束 (代碼: %errorlevel%)
    echo ========================================================
    pause
)
endlocal
