# Antigravity 2 全能增強工具箱 (`antigravity2-toolkit` / `ag2-toolkit`)

> **桌布美化 ‧ 繁簡中文化 ‧ 100% 保持官方原生深色/淺色主題與穩定性**  
> 專為 **Google Antigravity 2.0+** 設計的一站式開源增強工具箱，完美整合**自訂桌布引擎**與**深度中文本地化語言包**。

---

## 🌟 核心特色 (Key Features)

### 1. 🎨 自訂背景桌布 (Wallpaper Engine)
- **100% 保持官方原生深色 / 淺色主題**：完全不更動官方語法高亮、字型、配色與對話層次。
- **右側代碼編輯器 100% 純色不穿透**：代碼編輯區與 Diff 視窗保持純色不透明，代碼清晰易讀，背景絕不干擾閱讀。
- **頂部對話框與對話泡泡完美貼合**：Prompt 輸入與對話泡泡尺寸隨內容貼合，兼具毛玻璃質感與清爽外觀。
- **⚡ 零重啟 Hot-Reload**：修改圖片、透明度或模糊度即時在運行中的 Antigravity 視窗生效。
- **支援 Windows 11 原生 Mica / Acrylic 與 macOS 原生 Vibrancy（毛玻璃）特效**：調用系統原生材質渲染。

### 2. 🌐 深度中文在地化 (Chinese Localization)
- **繁體中文 (`zh-TW`) 與簡體中文 (`zh-CN`) 完整支援**：字典收錄逾 1,100+ 條精校專業術語。
- **全方位無死角覆蓋**：主界面、頂部原生系統選單、系統匣 (Tray) 右鍵選單、載入中動畫、更新彈窗、詳細設定面板、MCP 知識庫、新手引導等。
- **🛡️ 物理禁區隔離防護 (Enterprise Grade)**：
  - 嚴格跳過使用者輸入框（Prompt 輸入框、搜尋框、Composer、ProseMirror、Lexical 等）。
  - 嚴格跳過代碼與終端區（Monaco Editor、XTerm、CodeBlock 等）。
  - 嚴格跳過 Agent 思考推理過程（Thinking / CoT / Reasoning）。
  - 嚴格跳過對話內文 Markdown 渲染區。
- **靈活品牌名設定**：可選擇保留原生英文 `Antigravity`、隱藏品牌名或在地化顯示。

### 3. 📌 桌面即時狀態懸浮窗 (Desktop Floating Widget)
- **Windows 11 Fluent Acrylic 亞克力設計與 macOS Spaces 漫遊**：自適應系統深色/淺色主題，14px 圓角與細緻陰影，跨平台自然融合。
- **100% 向量 SVG 圖示 (Strictly Zero Emoji)**：全面採用高品質向量圖式庫，排版緊湊精緻。
- **即時雙向狀態監控**：
  - **狀態呼吸燈**：顯示待命中、思考時間（Thought for Xs）、工具執行中。
  - **檔案與指令統計**：即時統計探索檔案數、修改檔案數、代碼行數變化（`+X -Y`）與終端指令執行次數。
  - **動態歷程流**：支援展開查看近 10 項檔案檢視、檔案編輯與執行指令歷程。
- **互動式 Ask Question / 執行計畫決策**：
  - 當 Agent 觸發 `ask_question` 或任務計畫等待審批時，浮窗彈出高亮決策卡。
  - 支援在浮窗內直接點擊選項按鈕即時回應用戶選擇，無需切換 Antigravity 主視窗。
- **拖曳記憶與微型膠囊**：
  - 預設停靠於螢幕右下角，支援滑鼠任意拖曳並自動記憶關機座標。
  - 支援一鍵折疊為迷你膠囊狀態（高僅 38px）。
  - 內建跨平台快捷鍵 (Windows/Linux: `Ctrl+Shift+W`, macOS: `⌘+Shift+W`) 快速顯示 / 隱藏。

### 4. 🛡️ 安全無損與開發者友好
- **單次打包雙重注入**：桌布增強與中文化可在單次 ASAR 解包/重包中完成，零多餘解包開銷。
- **🛠️ Folder 開發模式 (`resources/app/`)**：支援免重新打包直接修改代碼與字典，修改即時生效。
- **🔄 一鍵無損還原**：自動備份 `app.asar.bak` 與 `app.asar.unpacked.bak`，隨時可完全恢復為官方原廠乾淨狀態。
- **macOS 自動重簽名與隔離修復**：內建 Ad-hoc 深度重簽名與 Gatekeeper 隔離清理 (`xattr -dr com.apple.quarantine`)，徹底杜絕損壞無法開啟問題。
- **Linux 權限保護與 Sudo 家目錄防護**：寫入系統安裝目錄時會自動透過 `sudo` 在原終端提示輸入密碼，並以 `SUDO_USER` 鎖定使用者真實配置目錄。
- **完整向下相容**：同時相容 `ag-themer` 與 `localization_engine.js` 舊版呼叫語法。

---

## 🚀 快速上手 (Quick Start)

### 方法 A：雙擊一鍵腳本 (Windows / macOS / Linux)

在專案目錄中：
- **開啟全功能視覺化互動選單**：
  - **Windows**: 根目錄直接雙擊 **`啟動工具箱.bat`**
  - **macOS**: 根目錄直接雙擊 **`啟動工具箱.command`**（或終端執行 `./啟動工具箱.sh`）
  - **Linux**: 終端執行 **`./啟動工具箱.sh`**；若修改 `/opt` 等受保護目錄，工具會自動顯示 `sudo` 密碼提示並提權後繼續。
- **快捷單項安裝腳本（位於 `scripts/` 目錄）**：
  - 一鍵安裝繁體中文：Windows 執行 `scripts/install_tw.bat`；macOS/Linux 執行 `./scripts/install_tw.sh`
  - 一鍵安裝簡體中文：Windows 執行 `scripts/install_cn.bat`；macOS/Linux 執行 `./scripts/install_cn.sh`
  - 一鍵還原官方英文：Windows 執行 `scripts/restore.bat`；macOS/Linux 執行 `./scripts/restore.sh`

---

### 方法 B：互動式終端選單 (Interactive Menu)

在終端中執行：
```bash
npm start
# 或
node bin/ag-toolkit.js
```
選單提供清晰直覺的控制面板：
```text
  目前系統狀態：
    修補模式:    ASAR 已修補
    程序狀態:    運行中 (7 個程序)
    原廠備份:    已安全備份 (app.asar.bak)
    中文化狀態:  ✔ 已安裝 繁體中文 (zh-TW) [保留英文 Antigravity]
    桌布狀態:    ✔ 已啟用自訂背景
    圖片路徑:    C:\path\to\wallpaper.png
    透明度:      0.35 (35%)
    模糊度:      0px
```

---

## 📖 CLI 命令行指南 (Command Reference)

```bash
# 查看完整說明
ag-toolkit --help

# 檢視目前安裝、桌布與中文化狀態
ag-toolkit status

# 設定桌布 (透明度 0.35，清晰高清)
ag-toolkit set "C:\path\to\wallpaper.png" -o 0.35 -b 0

# 清除桌布恢復官方純色外觀
ag-toolkit clear

# 一鍵全能修補 (同時修補桌布支援與繁體中文化)
ag-toolkit patch --tw -k

# 單獨安裝繁體中文化
ag-toolkit locale install --tw -k

# 單獨安裝簡體中文化 (保留英文品牌名)
ag-toolkit locale install --brand-title english -k

# 開啟 Folder 開發模式 (免打包即時修改)
ag-toolkit dev-mode on -k

# 關閉 Folder 開發模式並恢復 ASAR
ag-toolkit dev-mode off -k

# 徹底恢復官方原版 (移除所有補丁與中文化)
ag-toolkit restore -k

# 終止所有 Antigravity 背景處理程序
ag-toolkit kill

# 啟動 Antigravity
ag-toolkit launch
```

---

## 📂 專案檔案結構 (Project Structure)

```text
antigravity2-toolkit/
├── 啟動工具箱.bat                # Windows 雙擊啟動互動式選單 (UTF-8, 防閃退)
├── bin/
│   └── antigravity2-toolkit.js   # 主執行程式 (CLI / 互動式選單 / 向下相容別名)
├── dicts/                        # 簡體中文分類字典 (common, menu, agents, mcp, settings)
├── dicts_tw/                     # 繁體中文分類字典 (依台灣軟體工程習慣深度校訂)
├── scripts/                      # 快捷輔助腳本目錄
│   ├── install_tw.bat            # Windows 繁體中文一鍵快速安裝
│   ├── install_cn.bat            # Windows 簡體中文一鍵快速安裝
│   ├── restore.bat               # Windows 官方原版一鍵快速還原
│   ├── install_tw.sh             # macOS / Linux 繁體中文一鍵安裝
│   ├── install_cn.sh             # macOS / Linux 簡體中文一鍵安裝
│   └── restore.sh                # macOS / Linux 官方原版一鍵還原
├── src/                          # 核心模組架構
│   ├── index.js                  # 模組統一匯出入口
│   ├── paths.js                  # 跨平台 (Win/Mac/Linux) 安裝路徑自動偵測
│   ├── localizationManager.js    # 核心中文化引擎 (字典解析/DOM防護/選單/系統匣/彈窗注入)
│   ├── patcher.js                # 單次 ASAR 解包/雙重注入/重包引擎
│   ├── themeManager.js           # 桌布與樣式管理員 (內建 6 款風格/透明度與模糊編譯)
│   ├── customUiLoader.js         # 注入運行時載入器 (Mica/Acrylic/Iframe穿透/Hot-Reload)
│   ├── floatingWidgetManager.js  # 桌面懸浮窗 BrowserWindow 生命週期、座標記憶與 IPC 路由管理
│   ├── agentStatusObserver.js    # Antigravity 主視窗 DOM 狀態、思考時間、Step Accordion 與 Ask 決策提取
│   ├── widget/
│   │   └── widget.html           # 向量 SVG 亞克力即時懸浮面板
│   ├── backupManager.js          # ASAR 與 unpacked 完整備份還原
│   ├── devModeManager.js         # Folder 開發模式管理器
│   ├── processManager.js         # 跨平台程序生命週期管理
│   ├── configManager.js          # 設定檔持久化 (~/.gemini/antigravity/custom-ui/config.json)
│   ├── interactive.js            # 終端視覺化互動面板
│   └── cli.js                    # Commander CLI 指令定義
├── test/                         # 完整單元與整合測試套件 (7/7 通過)
│   ├── test_runner.js            # 自動化測試總執行器
│   ├── test_widget.js            # 桌面即時懸浮窗生命週期與 IPC 通訊測試
│   └── ...                       # 各模組獨立測試
├── package.json
└── README.md
```

---

## 🧪 自動化測試 (Automated Testing)

專案包含完整的單元測試與端到端打包邊界測試：
```bash
npm test
```
**測試項目涵蓋：**
1. `Patcher Injections & Idempotency`：AST 注入點精確度、冪等性與乾淨還原。
2. `Custom UI Runtime Loader & Frame Penetration`：Mica/Acrylic 材質選項、WebFrameMain 穿透、並發安全 Hot-Reload。
3. `Themes, Presets & Config Persistence`：自訂桌布樣式編譯、設定持久化。
4. `ASAR Pack, Boundary & Unpack Verification`：`app.asar` 提取打包、`chrome-devtools-mcp` 解包依賴保留驗證。
5. `Folder Dev Mode Lifecycle & Status`：Folder 開發模式建立、免重新打包即時修改、安全退出。
6. `Chinese Localization & Integrated Capabilities`：繁簡字典 1:1 校驗、Preload 語法無錯驗證、DOM 禁區排除過濾驗證、選單/托盤/載入頁/更新窗修補、桌布與中文化單次打包並存驗證、Antigravity 1.0 舊架構相容測試。
7. `Desktop Floating Widget & Live IPC`：懸浮窗預設四角邊界幾何座標、微型膠囊折疊狀態、Diff 指令指標正規化、雙向 IPC 決策轉發、全站嚴格零 Emoji 驗證。

---

## 🤝 致謝 (Credits)

- 核心本地化詞庫與注入原理參考自：[antigravity2-chinese](https://github.com/yanggu0413/antigravity2-chinese) 與 [antigravity2-cn](https://github.com/qqxpee/antigravity2-cn)
- 感謝 Antigravity 開發者社群的反饋與支持！
