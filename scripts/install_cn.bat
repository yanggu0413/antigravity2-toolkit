@echo off
setlocal
chcp 65001 >nul 2>&1
title Antigravity 2 - 安装简体中文本地化
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 找不到 Node.js，请先安装 Node.js！
    pause
    exit /b 1
)

echo.
echo ======================================================
echo  欢迎使用 Antigravity 简体中文本地化快速安装
echo ======================================================
echo.
echo 请选择左上角品牌名显示方式：
echo [1] 保持英文 Antigravity（推荐，美观原生）
echo [2] 隐藏品牌名称
echo [3] 启用品牌名称本地化
set "CHOICE_VAL=1"
set /p "CHOICE_VAL=请选择 [1/2/3] (直接按 Enter 默认选择 1): "
set "BRAND_ARG=--brand-title english"
if "%CHOICE_VAL%"=="2" set "BRAND_ARG=--brand-title hidden"
if "%CHOICE_VAL%"=="3" set "BRAND_ARG=--brand-title translated"

echo.
echo 正在安装简体中文本地化...
node "%~dp0..\bin\antigravity2-toolkit.js" %BRAND_ARG% %*

if errorlevel 1 (
    echo.
    echo [×] 安装失败，请检查上方信息。
    pause
    exit /b 1
)

echo.
echo [√] 简体中文本地化已成功部署！
echo 按任意键关闭窗口...
pause >nul
endlocal
