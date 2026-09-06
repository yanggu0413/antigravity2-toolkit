@echo off
chcp 65001 >nul
title Antigravity 全能增强工具箱

cd /d "%~dp0"
node bin/antigravity2-toolkit.js

if %errorlevel% neq 0 (
    echo.
    echo 执行发生错误，请检查错误信息。
    pause
)
