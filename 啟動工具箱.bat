@echo off
setlocal
chcp 65001 >nul 2>&1
title Antigravity 2 全能增強工具箱

:: 設定控制台視窗尺寸 (寬 96 列, 高 32 行)，確保邊框與選單排版整齊不折行
mode con: cols=96 lines=32 >nul 2>&1

cd /d "%~dp0"

:: 檢查 Node.js 執行環境
where node >nul 2>&1
if errorlevel 1 (
    cls
    echo.
    echo  ┌────────────────────────────────────────────────────────────┐
    echo  │ [錯誤] 系統未安裝或找不到 Node.js 執行環境                   │
    echo  │                                                            │
    echo  │ Antigravity 工具箱需要 Node.js 環境才能運行。              │
    echo  │ 請前往官方網站下載並安裝 LTS 穩定版本：                    │
    echo  │ https://nodejs.org                                         │
    echo  │                                                            │
    echo  │ 安裝完成後，請重新點擊此檔案啟動。                         │
    echo  └────────────────────────────────────────────────────────────┘
    echo.
    pause
    exit /b 1
)

:: 如果帶有參數，直接執行 CLI 模式
if not "%~1"=="" (
    node "%~dp0bin\antigravity2-toolkit.js" %*
    goto END
)

:: 無參數時啟動互動式選單
node "%~dp0bin\antigravity2-toolkit.js"

:END
if errorlevel 1 (
    echo.
    echo  [提示] 程式已退出 (結束代碼: %errorlevel%)
    pause
)
endlocal

