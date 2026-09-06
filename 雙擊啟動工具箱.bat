@echo off
chcp 65001 >nul
title Antigravity 全能增強工具箱

cd /d "%~dp0"
node bin/antigravity2-toolkit.js

if %errorlevel% neq 0 (
    echo.
    echo 執行發生錯誤，請檢查錯誤訊息。
    pause
)
