const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const crypto = require('crypto');
const paths = require('./paths');

const SIGNATURE_START = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';
const SIGNATURE_END = '/* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */';
const TRAY_START = '/* --- TRAY TRANSLATION START --- */';
const TRAY_END = '/* --- TRAY TRANSLATION END --- */';
const MENU_START = '// ==========================================\n    // Antigravity Native Menu Chinese Translation';
const MENU_END = 'translateMenu(menu.items);';

const BRAND_TITLE_ALIASES = {
  english: 'english',
  en: 'english',
  default: 'english',
  hidden: 'hidden',
  hide: 'hidden',
  none: 'hidden',
  translated: 'translated',
  chinese: 'translated',
  cn: 'translated',
  zh: 'translated',
};

function normalizeBrandTitleMode(mode) {
  if (!mode) return 'english';
  const clean = String(mode).trim().toLowerCase();
  return BRAND_TITLE_ALIASES[clean] || 'english';
}

function normalizeLocale(locale) {
  if (!locale) return 'zh-CN';
  const clean = String(locale).trim().toLowerCase().replace(/_/g, '-');
  if (clean === 'tw' || clean === 'zh-tw' || clean === 'traditional' || clean === 'cht') {
    return 'zh-TW';
  }
  return 'zh-CN';
}

function normalizeText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/“/g, '"')
    .replace(/”/g, '"')
    .replace(/…/g, '...');
}

function resolveDictsDir(locale, customDictsDir) {
  const normLocale = normalizeLocale(locale);
  const folderName = normLocale === 'zh-TW' ? 'dicts_tw' : 'dicts';

  if (customDictsDir && fs.existsSync(customDictsDir)) {
    return path.resolve(customDictsDir);
  }

  // Candidate locations
  const candidates = [
    path.join(__dirname, '..', folderName),
    path.join(__dirname, '..', 'antigravity2-chinese-main', folderName),
    path.join(__dirname, folderName),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return path.resolve(c);
    }
  }

  return path.join(__dirname, '..', folderName);
}

function loadDictionary(options = {}) {
  const locale = normalizeLocale(options.locale || 'zh-CN');
  const brandTitle = normalizeBrandTitleMode(options.brandTitle || 'english');
  const dictsDir = resolveDictsDir(locale, options.dictsDir);

  const totalMap = {};
  if (fs.existsSync(dictsDir)) {
    const files = fs.readdirSync(dictsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(dictsDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);
          for (const [k, v] of Object.entries(data)) {
            const normK = normalizeText(k);
            if (normK) {
              totalMap[normK] = v;
            }
          }
        } catch (_) {
          // Ignore individual malformed files
        }
      }
    }
  }

  if (brandTitle === 'english') {
    delete totalMap[normalizeText('Antigravity')];
  } else if (brandTitle === 'hidden') {
    totalMap[normalizeText('Antigravity')] = '';
  }

  return totalMap;
}

function generatePreloadJs(options = {}) {
  const locale = normalizeLocale(options.locale || 'zh-CN');
  const isTw = locale === 'zh-TW';
  const fullDict = loadDictionary(options);
  const longEntries = Object.entries(fullDict).sort((a, b) => b[0].length - a[0].length);

  const dictJson = JSON.stringify(fullDict, null, 2);
  const entriesJson = JSON.stringify(longEntries);

  const clientTemplate = `${SIGNATURE_START}
(() => {
    // V13.0 企業級高可用防護版：批次微任務防抖 + 虛擬 DOM 隔離 + 物理禁區過濾
    const USE_TW = ${isTw ? 'true' : 'false'};
    const map = new Map(Object.entries(DICT_PLACEHOLDER));
    const lowerMap = new Map();
    for (const [k, v] of map.entries()) lowerMap.set(k.toLowerCase(), v);
    
    const longEntries = REPLACEMENT_ENTRIES_PLACEHOLDER;
    const translatedValues = new WeakMap();
    const observedRoots = new WeakSet();
    let isMutatingSelf = false;

    // 1. 物理隔離保護引擎：嚴禁干擾使用者輸入框、Agent 思考推理過程、程式碼塊與終端
    const SKIP_TAGS = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'KBD', 'SAMP', 'TEXTAREA', 'INPUT'];

    function isExcludedContainer(el) {
        if (!el) return false;
        let curr = el.nodeType === 1 ? el : el.parentElement;
        let depth = 0;
        while (curr && depth < 12) {
            const tag = (curr.tagName || '').toUpperCase();
            if (SKIP_TAGS.includes(tag)) return true;

            // (A) 任何可編輯輸入區域（Prompt 輸入框、搜尋框、編輯器等）
            if (curr.isContentEditable || curr.getAttribute('contenteditable') === 'true' || curr.getAttribute('role') === 'textbox') {
                return true;
            }

            // (B) 標記不翻譯的元素
            if (curr.getAttribute && (curr.getAttribute('translate') === 'no' || (curr.classList && curr.classList.contains('notranslate')))) {
                return true;
            }
            
            // (C) 類別名稱精準過濾
            const cls = typeof curr.className === 'string' ? curr.className : (curr.getAttribute && curr.getAttribute('class') || '');
            if (cls) {
                const cn = cls.toLowerCase();
                if (
                    // 程式碼與終端
                    cn.includes('monaco-editor') ||
                    cn.includes('view-lines') ||
                    cn.includes('view-line') ||
                    cn.includes('lines-content') ||
                    cn.includes('xterm') ||
                    cn.includes('code-block') ||
                    cn.includes('codeblock') ||
                    cn.includes('cm-editor') ||
                    cn.includes('cm-content') ||
                    cn.includes('font-mono') ||
                    cn.includes('font-code') ||
                    cn.includes('hljs') ||
                    cn.includes('syntax-highlighted') ||
                    // 使用者輸入框與編輯器架構 (ProseMirror, Lexical, Draft.js, Composer)
                    cn.includes('prosemirror') ||
                    cn.includes('lexical') ||
                    cn.includes('prompt-input') ||
                    cn.includes('chat-input') ||
                    cn.includes('composer') ||
                    cn.includes('input-container') ||
                    // Agent 思考推理過程 (Thinking / CoT / Reasoning)
                    cn.includes('thinking') ||
                    cn.includes('thought') ||
                    cn.includes('reasoning') ||
                    // 對話訊息內文渲染區 (Markdown Body)
                    cn.includes('markdown') ||
                    cn.includes('message-content') ||
                    cn.includes('rendered-markdown') ||
                    cn.includes('agent-response')
                ) {
                    return true;
                }
            }

            // (D) 自訂 data 屬性過濾
            if (curr.dataset) {
                if (curr.dataset.thought !== undefined || curr.dataset.thinking !== undefined || curr.dataset.reasoning !== undefined) {
                    return true;
                }
            }

            curr = curr.parentElement;
            depth++;
        }
        return false;
    }

    function norm(s) {
        if (!s) return '';
        return s.replace(/\\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').trim();
    }

    function translateWithShortcut(val) {
        if (!val) return null;
        const match = val.match(/^(.+?)\\s*\\((Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)\\+?([^)]*)\\)$/i);
        if (match) {
            const prefix = match[1].trim();
            const normPref = norm(prefix);
            const lowerPref = normPref.toLowerCase();
            let transPref = null;
            if (map.has(normPref)) {
                transPref = map.get(normPref);
            } else if (lowerMap.has(lowerPref)) {
                transPref = lowerMap.get(lowerPref);
            }
            if (transPref) {
                return transPref + " (" + match[2] + (match[3] ? "+" + match[3] : "") + ")";
            }
        }
        return null;
    }

    // 2. 批次排程佇列（消除 Mutation 風暴與 React 衝突）
    const pendingNodes = new Set();
    let isScheduled = false;

    function scheduleBatch() {
        if (isScheduled) return;
        isScheduled = true;
        const runner = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb => setTimeout(cb, 16));
        runner(flushBatch);
    }

    function flushBatch() {
        isScheduled = false;
        if (pendingNodes.size === 0) return;
        const nodes = Array.from(pendingNodes);
        pendingNodes.clear();
        for (const node of nodes) {
            if (node && node.isConnected !== false) {
                translateNode(node);
            }
        }
    }

    function translateNode(node) {
        try {
            if (!node || node.isConnected === false) return;
            
            if (node.nodeType === 1) { // ELEMENT_NODE
                if (isExcludedContainer(node)) return;

                // 翻譯屬性：placeholder, title, aria-label
                for (const attr of ['placeholder', 'title', 'aria-label']) {
                    const v = node.getAttribute(attr);
                    if (v) {
                        const t = norm(v);
                        const shortcutTrans = translateWithShortcut(t);
                        if (shortcutTrans) node.setAttribute(attr, shortcutTrans);
                        else if (map.has(t)) node.setAttribute(attr, map.get(t));
                        else if (lowerMap.has(t.toLowerCase())) node.setAttribute(attr, lowerMap.get(t.toLowerCase()));
                        else if (/^Show\\s+(\\d+)\\s+more/i.test(t)) {
                            const trans = t.replace(/^Show\\s+(\\d+)\\s+more(\\s+(results?|items?|commands?|options?))?(\\.\\.\\.|…)?$/i, (m, num, p2, type) => {
                                if (type) {
                                    if (/result/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個結果...") : ("显示另外 " + num + " 个结果...");
                                    if (/command/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個命令...") : ("显示另外 " + num + " 个命令...");
                                    if (/item/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個項目...") : ("显示另外 " + num + " 个项目...");
                                    if (/option/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個選項...") : ("显示另外 " + num + " 个选项...");
                                }
                                return USE_TW ? ("顯示另外 " + num + " 個...") : ("显示另外 " + num + " 个...");
                            });
                            node.setAttribute(attr, trans);
                        }
                    }
                }

                if (node.shadowRoot) translateNode(node.shadowRoot);
                for (const child of node.childNodes) translateNode(child);

            } else if (node.nodeType === 3) { // TEXT_NODE
                if (isExcludedContainer(node.parentElement)) return;
                let originalVal = node.nodeValue;
                if (!originalVal || originalVal.trim().length < 1) return;

                // 骨架占位文本標記
                if (originalVal.toLowerCase().includes('pack.info')) {
                    const parent = node.parentElement;
                    if (parent) {
                        if (parent.getAttribute('translate') !== 'no') {
                            parent.setAttribute('translate', 'no');
                        }
                        try {
                            if (!parent.classList.contains('notranslate')) {
                                parent.classList.add('notranslate');
                            }
                        } catch (e) {}
                    }
                    return;
                }

                if (translatedValues.get(node) === originalVal) return;

                let newVal = originalVal;
                const valNorm = norm(originalVal);
                const valLower = valNorm.toLowerCase();
                
                // 1. 精確匹配（含大小寫自動糾正與快捷鍵檢測）
                const shortcutTrans = translateWithShortcut(valNorm);
                if (shortcutTrans) {
                    newVal = shortcutTrans;
                } else if (map.has(valNorm)) {
                    newVal = map.get(valNorm);
                } else if (lowerMap.has(valLower)) {
                    newVal = lowerMap.get(valLower);
                } else if (/^The AlloyDB for PostgreSQL remote/i.test(valNorm)) {
                    newVal = USE_TW ? "AlloyDB for PostgreSQL 遠端 MCP 伺服器可讓您存取並執行 AlloyDB 工具，用於管理 AlloyDB 叢集及執行個體、管理使用者，以及建立和復原資料備份。" : "AlloyDB for PostgreSQL 远程 MCP 服务器可让您访问并运行 AlloyDB 工具，用于管理 AlloyDB 集群及实例、管理用户，以及创建和恢复数据备份。";
                } else if (/^The Cloud SQL remote/i.test(valNorm)) {
                    newVal = USE_TW ? "Cloud SQL 遠端 MCP 伺服器可讓您存取並執行 Cloud SQL 工具，用於管理 Cloud SQL 執行個體、管理使用者、建立和復原資料備份及資料庫維運。" : "Cloud SQL 远程 MCP 服务器可让您访问并运行 Cloud SQL 工具，用于管理 Cloud SQL 实例、管理用户、创建和恢复数据备份及数据库运维。";
                } else if (/^The Spanner remote/i.test(valNorm)) {
                    newVal = USE_TW ? "Spanner 遠端 MCP 伺服器可讓您從 AI 開發環境中存取並執行 Spanner 工具，以建立、管理和查詢分散式資料庫資源。" : "Spanner 远程 MCP 服务器可让您从 AI 开发环境中访问并运行 Spanner 工具，以创建、管理和查询分布式数据库资源。";
                } else if (/^Ask questions\\.\\s*Get answers\\./i.test(valNorm) || /PostHog data/i.test(valNorm)) {
                    newVal = USE_TW ? "提問，即得答案。該 MCP 是供您的程式開發 Agent 呼叫的伺服器。用英文提出問題，它會針對您的 PostHog 資料執行查詢，結果將直接呈現在您的編輯器中。" : "提问，即得答案。该 MCP 是供您的编程 Agent 调用的服务器。用英语提出问题，它会针对您的 PostHog 数据运行查询，结果将直接呈现在您的编辑器中。";
                } else if (/^The GKE remote MCP server/i.test(valNorm)) {
                    newVal = USE_TW ? "GKE 遠端 MCP 伺服器提供對 GKE Kubernetes 資源的讀寫存取權限。允許 AI Agent 檢查並監控您的執行環境。" : "GKE 远程 MCP 服务器提供对 GKE Kubernetes 资源的读写权限。允许 AI Agent 检查并监控您的运行环境。";
                } else if (/^Cloud CLI MCP Server/i.test(valNorm)) {
                    newVal = USE_TW ? "Cloud CLI MCP 伺服器提供在遠端沙箱環境中執行 gcloud 與 bq CLI 命令的工具集。" : "Cloud CLI MCP 服务器提供在远程沙箱环境中运行 gcloud 与 bq CLI 命令的工具集。";
                } else if (/^The Apigee API hub remote MCP server/i.test(valNorm)) {
                    newVal = USE_TW ? "Apigee API hub 遠端 MCP 伺服器可讓您管理註冊在 Apigee API hub 中的 API、版本、規格、操作、部署、屬性、外部 API 以及相依性。" : "Apigee API hub 远程 MCP 服务器可让您管理注册在 Apigee API hub 中的 API、版本、规范、操作、部署、属性、外部 API 以及依赖项。";
                } else if (/^The Google Home Developer MCP server/i.test(valNorm)) {
                    newVal = USE_TW ? "Google Home Developer MCP 伺服器支援檢索 Google Home 文件、OpenThread 與 Matter 規格文件。" : "Google Home Developer MCP 服务器支持检索 Google Home 文档、OpenThread 与 Matter 规范文档。";
                } else if (/^The Cloud Quotas MCP server/i.test(valNorm)) {
                    newVal = USE_TW ? "Cloud Quotas MCP 伺服器支援檢視配額分配、申請提升配額以及管理 Quota Adjuster 自動調整設定。" : "Cloud Quotas MCP 服务器支持查看配额分配、申请提升配额以及管理 Quota Adjuster 自动调整配置。";
                } else if (/^Build, edit, deploy, and manage full-stack web apps with Lovable/i.test(valNorm)) {
                    newVal = USE_TW ? "使用自然語言，藉助 AI 應用程式建構工具 Lovable 建構、編輯、部署和管理全端 Web 應用程式。該 MCP 伺服器將您的 AI 用戶端連接至 Lovable，允許您的 AI Agent 直接在偏好的編輯器或環境內互動、建立和管理 Lovable 專案。" : "使用自然语言，借助 AI 应用构建工具 Lovable 构建、编辑、部署和管理全栈 Web 应用。该 MCP 服务器将您的 AI 客户端连接至 Lovable，允许您的 AI Agent 直接在偏好的编辑器或环境中交互、创建和管理 Lovable 项目。";
                } else if (/^Refreshes in (.+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Refreshes in (.+)$/i, (match, timeStr) => {
                        let formatted = timeStr
                            .replace(/[\\.\\?\\s]+$/, '')
                            .replace(/(\\d+)\\s*days?/gi, (m, n) => USE_TW ? (n + " 天") : (n + " 天"))
                            .replace(/(\\d+)\\s*hours?/gi, (m, n) => USE_TW ? (n + " 小時") : (n + " 小时"))
                            .replace(/(\\d+)\\s*minutes?/gi, (m, n) => USE_TW ? (n + " 分鐘") : (n + " 分钟"))
                            .replace(/(\\d+)\\s*seconds?/gi, (m, n) => USE_TW ? (n + " 秒") : (n + " 秒"))
                            .replace(/,\\s*/g, ' ')
                            .trim();
                        return USE_TW ? (formatted + " 後更新") : (formatted + " 后刷新");
                    });
                } else if (/^You have used some of your (.+?) limit, it will (fully )?refresh in (.+?)\\??$/i.test(valNorm) || /^You have used some of your (.+?), it will (fully )?refresh in (.+?)\\??$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^You have used some of your (.+?)( limit)?, it will (fully )?refresh in (.+?)\\??$/i, (match, limitType, hasLimit, fully, timeStr) => {
                        let translatedLimit = limitType;
                        if (/weekly/i.test(limitType)) translatedLimit = USE_TW ? "每週限制" : "每周限制";
                        else if (/daily/i.test(limitType)) translatedLimit = USE_TW ? "每日限制" : "每日限制";
                        else if (/monthly/i.test(limitType)) translatedLimit = USE_TW ? "每月限制" : "每月限制";
                        else if (/(\\d+)-hour/i.test(limitType)) {
                            const h = limitType.match(/(\\d+)-hour/i)[1];
                            translatedLimit = USE_TW ? (h + " 小時限制") : (h + " 小时限制");
                        }
                        let formattedTime = timeStr
                            .replace(/[\\.\\?\\s]+$/, '')
                            .replace(/(\\d+)\\s*days?/gi, (m, n) => USE_TW ? (n + " 天") : (n + " 天"))
                            .replace(/(\\d+)\\s*hours?/gi, (m, n) => USE_TW ? (n + " 小時") : (n + " 小时"))
                            .replace(/(\\d+)\\s*minutes?/gi, (m, n) => USE_TW ? (n + " 分鐘") : (n + " 分钟"))
                            .replace(/(\\d+)\\s*seconds?/gi, (m, n) => USE_TW ? (n + " 秒") : (n + " 秒"))
                            .replace(/,\\s*/g, ' ')
                            .trim();
                        const prefixLimit = translatedLimit.match(/^\\d/) ? (" " + translatedLimit) : translatedLimit;
                        return USE_TW 
                            ? ("您已使用了部分" + prefixLimit + "，將在 " + formattedTime + " 後完全更新。")
                            : ("您已使用了部分" + prefixLimit + "，将在 " + formattedTime + " 后完全刷新。");
                    });
                } else if (/^You have reached your (.+?) limit, it will (fully )?refresh in (.+?)\\??$/i.test(valNorm) || /^You have reached your (.+?), it will (fully )?refresh in (.+?)\\??$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^You have reached your (.+?)( limit)?, it will (fully )?refresh in (.+?)\\??$/i, (match, limitType, hasLimit, fully, timeStr) => {
                        let translatedLimit = limitType;
                        if (/weekly/i.test(limitType)) translatedLimit = USE_TW ? "每週限制" : "每周限制";
                        else if (/daily/i.test(limitType)) translatedLimit = USE_TW ? "每日限制" : "每日限制";
                        else if (/monthly/i.test(limitType)) translatedLimit = USE_TW ? "每月限制" : "每月限制";
                        else if (/(\\d+)-hour/i.test(limitType)) {
                            const h = limitType.match(/(\\d+)-hour/i)[1];
                            translatedLimit = USE_TW ? (h + " 小時限制") : (h + " 小时限制");
                        }
                        let formattedTime = timeStr
                            .replace(/[\\.\\?\\s]+$/, '')
                            .replace(/(\\d+)\\s*days?/gi, (m, n) => USE_TW ? (n + " 天") : (n + " 天"))
                            .replace(/(\\d+)\\s*hours?/gi, (m, n) => USE_TW ? (n + " 小時") : (n + " 小时"))
                            .replace(/(\\d+)\\s*minutes?/gi, (m, n) => USE_TW ? (n + " 分鐘") : (n + " 分钟"))
                            .replace(/(\\d+)\\s*seconds?/gi, (m, n) => USE_TW ? (n + " 秒") : (n + " 秒"))
                            .replace(/,\\s*/g, ' ')
                            .trim();
                        const prefixLimit = translatedLimit.match(/^\\d/) ? (" " + translatedLimit) : translatedLimit;
                        return USE_TW 
                            ? ("您已達到" + prefixLimit + "，將在 " + formattedTime + " 後重設。")
                            : ("您已达到" + prefixLimit + "，将在 " + formattedTime + " 后重置。");
                    });
                } else if (/^Learn more about\\s*(.*)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Learn more about\\s*(.*)$/i, (match, p) => {
                        if (!p || !p.trim()) {
                            return USE_TW ? "瞭解更多關於" : "了解更多关于";
                        }
                        let translatedPreset = p.trim();
                        if (/^default$/i.test(translatedPreset)) translatedPreset = USE_TW ? "預設 (Default)" : "默认 (Default)";
                        else if (/^full machine$/i.test(translatedPreset)) translatedPreset = USE_TW ? "整部電腦存取 (Full Machine)" : "整机访问 (Full Machine)";
                        else if (/^turbo mode$/i.test(translatedPreset)) translatedPreset = USE_TW ? "極速模式 (Turbo Mode)" : "极速模式 (Turbo Mode)";
                        else if (/^custom$/i.test(translatedPreset)) translatedPreset = USE_TW ? "自訂 (Custom)" : "自定义 (Custom)";
                        return USE_TW ? ("瞭解更多關於 " + translatedPreset + " 的詳細資訊") : ("了解更多关于 " + translatedPreset + " 的信息");
                    });
                } else if (/^Yes, and always allow '(.+)' in this project$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Yes, and always allow '(.+)' in this project$/i, (match, cmd) => {
                        return USE_TW ? ("是，且在此專案中一律允許執行 '" + cmd + "'") : ("是，且在此项目中始终允许运行 '" + cmd + "'");
                    });
                } else if (/^Yes, and always allow '(.+)'$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Yes, and always allow '(.+)'$/i, (match, cmd) => {
                        return USE_TW ? ("是，且一律允許執行 '" + cmd + "'") : ("是，且始终允许运行 '" + cmd + "'");
                    });
                } else if (/^(\\d+)\\s+tools?(\\s+enabled)?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+)\\s+tools?(\\s+enabled)?$/i, (match, num, enabled) => {
                        return num + (USE_TW ? " 個工具" : " 个工具") + (enabled ? (USE_TW ? "已啟用" : "已启用") : "");
                    });
                } else if (/^(\\d+)\\s+skills?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+)\\s+skills?$/i, (match, num) => {
                        return num + (USE_TW ? " 個技能" : " 个技能");
                    });
                } else if (/^(\\d+)\\s+rules?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+)\\s+rules?$/i, (match, num) => {
                        return num + (USE_TW ? " 條規則" : " 条规则");
                    });
                } else if (/^Show\\s+(\\d+)\\s+more(\\s+(results?|items?|commands?|options?))?(\\.\\.\\.|…)?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Show\\s+(\\d+)\\s+more(\\s+(results?|items?|commands?|options?))?(\\.\\.\\.|…)?$/i, (match, num, p2, type) => {
                        if (type) {
                            if (/result/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個結果...") : ("显示另外 " + num + " 个结果...");
                            if (/command/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個命令...") : ("显示另外 " + num + " 个命令...");
                            if (/item/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個項目...") : ("显示另外 " + num + " 个项目...");
                            if (/option/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個選項...") : ("显示另外 " + num + " 个选项...");
                        }
                        return USE_TW ? ("顯示另外 " + num + " 個...") : ("显示另外 " + num + " 个...");
                    });
                } else if (/^See all\\s*\\((\\d+)\\)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^See all\\s*\\((\\d+)\\)$/i, (match, num) => {
                        return USE_TW ? ("顯示全部 (" + num + ")") : ("显示全部 (" + num + ")");
                    });
                } else if (/^Available AI Credits: (\\d+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Available AI Credits: (\\d+)$/i, (match, num) => {
                        return USE_TW ? ("可用 AI 額度: " + num) : ("可用 AI 额度: " + num);
                    });
                } else if (/^Version\\s+([\\d\\.]+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Version\\s+([\\d\\.]+)$/i, (match, v) => {
                        return "版本 " + v;
                    });
                } else if (/^(now|just now)$/i.test(valNorm)) {
                    newVal = USE_TW ? "剛剛" : "刚刚";
                } else if (/^(\\d+)(s|m|h|d|w|mo|yr)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+)(s|m|h|d|w|mo|yr)$/i, (match, num, unit) => {
                        const unitLower = unit.toLowerCase();
                        let unitStr = "";
                        if (unitLower === "s") unitStr = USE_TW ? "秒前" : "秒前";
                        else if (unitLower === "m") unitStr = USE_TW ? "分鐘前" : "分钟前";
                        else if (unitLower === "h") unitStr = USE_TW ? "小時前" : "小时前";
                        else if (unitLower === "d") unitStr = USE_TW ? "天前" : "天前";
                        else if (unitLower === "w") unitStr = USE_TW ? "週前" : "周前";
                        else if (unitLower === "mo") unitStr = USE_TW ? "個月前" : "个月前";
                        else if (unitLower === "yr") unitStr = USE_TW ? "年前" : "年前";
                        return num + unitStr;
                    });
                } else if (/^All changes since (.+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^All changes since (.+)$/i, (match, branch) => {
                        return USE_TW ? ("自 " + branch + " 以來的所有變更") : ("自 " + branch + " 以来的所有更改");
                    });
                } else if (/^including\\s+(\\d+)\\s+active\\s+conversations?\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^including\\s+(\\d+)\\s+active\\s+conversations?(\\.)?$/i, (match, num, dot) => {
                        return (USE_TW ? ("包含 " + num + " 個使用中的對話") : ("包含 " + num + " 个活动对话")) + (dot ? "。" : "");
                    });
                } else if (/^including\\s+(\\d+)\\s+conversations?\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^including\\s+(\\d+)\\s+conversations?(\\.)?$/i, (match, num, dot) => {
                        return (USE_TW ? ("包含 " + num + " 個對話") : ("包含 " + num + " 个对话")) + (dot ? "。" : "");
                    });
                } else if (/^(.+?)\\s+including\\s+(\\d+)\\s+active\\s+conversations?\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(.+?)\\s+including\\s+(\\d+)\\s+active\\s+conversations?(\\.)?$/i, (match, p, num, dot) => {
                        return p + " " + (USE_TW ? ("包含 " + num + " 個使用中的對話") : ("包含 " + num + " 个活动对话")) + (dot ? "。" : "");
                    });
                } else if (/^(.+?)\\s+Queues after the turn$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(.+?)\\s+Queues after the turn$/i, (m, k) => k + " " + (USE_TW ? "本輪結束後排入佇列" : "本轮结束后加入队列"));
                } else if (/^(.+?)\\s+Sends immediately$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(.+?)\\s+Sends immediately$/i, (m, k) => k + " " + (USE_TW ? "立即傳送" : "立即发送"));
                } else if (/^(.+?)\\s+On empty prompt,\\s*sends next in queue$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(.+?)\\s+On empty prompt,\\s*sends next in queue$/i, (m, k) => k + " " + (USE_TW ? "輸入框為空時傳送佇列中的下一則" : "输入框为空时发送队列中的下一条"));
                } else if (/^(.+?): context deadline exceeded$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(.+?): context deadline exceeded$/i, (match, prefix) => {
                        return prefix + (USE_TW ? ": 請求超時 (context deadline exceeded)" : ": 请求超时 (context deadline exceeded)");
                    });
                } else if (/^(.+?): i\\/o timeout$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(.+?): i\\/o timeout$/i, (match, prefix) => {
                        return prefix + (USE_TW ? ": I/O 超時 (i/o timeout)" : ": I/O 超时 (i/o timeout)");
                    });
                } else if (/^Are you sure you want to delete (the |this )?project (.+?)\\??$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Are you sure you want to delete (the |this )?project (.+?)\\??$/i, (match, article, name) => {
                        return USE_TW ? ("您確定要刪除專案 " + name + " 嗎？") : ("您确定要删除项目 " + name + " 吗？");
                    });
                } else if (/^The (.+?) remote MCP server lets you access and run (.+?) tools to (.+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^The (.+?) remote MCP server lets you access and run (.+?) tools to (.+)$/i, (match, name, tools, action) => {
                        return name + (USE_TW ? " 遠端 MCP 伺服器可讓您存取並執行 " : " 远程 MCP 服务器可让您访问并运行 ") + tools + (USE_TW ? " 工具以進行管理與操作。" : " 工具以进行管理与操作。");
                    });
                } else if (/^The (.+?) remote MCP server lets you manage (.+) resources\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^The (.+?) remote MCP server lets you manage (.+) resources\\.?$/i, (match, name, res) => {
                        return name + (USE_TW ? " 遠端 MCP 伺服器可讓您管理 " : " 远程 MCP 服务器可让您管理 ") + res + (USE_TW ? " 資源。" : " 资源。");
                    });
                } else if (/^Send feedback as(\\s+(.+))?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Send feedback as(\\s+(.+))?$/i, (match, p1, email) => {
                        if (email) {
                            return "以 " + email + (USE_TW ? " 身分傳送意見回饋" : " 身份发送反馈");
                        }
                        return USE_TW ? "以此身分傳送意見回饋：" : "以如下身份发送反馈：";
                    });
                } else if (valNorm.length >= 15) {
                    // 2. 長句子滑動替換（僅在長度 >= 15 時執行，快速短路過濾）
                    for (const [key, translated] of longEntries) {
                        if (key.length > 15 && valNorm.includes(key)) {
                            newVal = newVal.split(key).join(translated);
                            break;
                        } else if (key.length >= 18 && valNorm.length >= 18 && valLower.slice(0, 18) === key.slice(0, 18).toLowerCase()) {
                            newVal = translated;
                            break;
                        }
                    }
                }

                // 3. 安全寫入（防自觸發與 React 脫鉤節點保護）
                if (newVal !== originalVal) {
                    translatedValues.set(node, newVal);
                    isMutatingSelf = true;
                    try {
                        if (node.isConnected !== false) {
                            node.nodeValue = newVal;
                        }
                    } catch (e) {} finally {
                        isMutatingSelf = false;
                    }
                }
            }
        } catch (e) {}
    }

    // 3. 帶有防自觸發與批次排程的 MutationObserver
    const observer = new MutationObserver(mutations => {
        if (isMutatingSelf) return;
        for (const m of mutations) {
            if (m.type === 'childList') {
                for (const n of m.addedNodes) {
                    if (n.nodeType === 1 || n.nodeType === 3) {
                        pendingNodes.add(n);
                    }
                }
            } else if (m.type === 'characterData') {
                if (m.target && m.target.nodeType === 3) {
                    pendingNodes.add(m.target);
                }
            }
        }
        if (pendingNodes.size > 0) {
            scheduleBatch();
        }
    });

    const obsOpts = { childList: true, subtree: true, characterData: true };

    // 4. 冪等啟動引擎
    let isInitialized = false;
    const startEngine = () => {
        const target = document.body || document.documentElement;
        if (target) {
            if (!isInitialized) {
                isInitialized = true;
                try {
                    observer.observe(target, obsOpts);
                } catch (e) {}
            }
            translateNode(target);
        }
    };

    // 5. ShadowRoot 生命週期監聽防洩漏
    const origAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function() {
        const sr = origAttachShadow.apply(this, arguments);
        if (sr && !observedRoots.has(sr)) {
            observedRoots.add(sr);
            try { observer.observe(sr, obsOpts); } catch(e) {}
        }
        return sr;
    };

    // 6. 優雅事件綁定
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startEngine);
    } else {
        startEngine();
    }
    window.addEventListener('load', startEngine);
})();
${SIGNATURE_END}`;

  return clientTemplate
    .replace('DICT_PLACEHOLDER', dictJson)
    .replace('REPLACEMENT_ENTRIES_PLACEHOLDER', entriesJson);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanPreloadJs(content) {
  const regex = new RegExp(escapeRegExp(SIGNATURE_START) + '[\\s\\S]*?' + escapeRegExp(SIGNATURE_END), 'g');
  return content.replace(regex, '').trimEnd();
}

function isPatchedLocalization(preloadContent) {
  return typeof preloadContent === 'string' && preloadContent.includes(SIGNATURE_START);
}

function detectPatchedLocale(preloadContent) {
  if (!isPatchedLocalization(preloadContent)) return null;
  return preloadContent.includes('const USE_TW = true;') ? 'zh-TW' : 'zh-CN';
}

function patchPreloadJs(content, options = {}) {
  const cleaned = cleanPreloadJs(content);
  const injection = generatePreloadJs(options);
  return `${cleaned}\n\n${injection}\n`;
}

function unpatchPreloadJs(content) {
  return cleanPreloadJs(content) + '\n';
}

function cleanMenuJs(content) {
  const startMark = '// ==========================================';
  const endMark = 'translateMenu(menu.items);';
  const startIdx = content.indexOf(startMark);
  const endIdx = content.indexOf(endMark);
  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    return content.substring(0, startIdx).trimEnd() + '\n    ' + content.substring(endIdx + endMark.length).trimStart();
  }
  return content;
}

function patchMenuJs(content, options = {}) {
  const locale = normalizeLocale(options.locale || 'zh-CN');
  const isTw = locale === 'zh-TW';
  const cleaned = cleanMenuJs(content);

  const menuTranslationJs = `
    // ==========================================
    // Antigravity Native Menu Chinese Translation
    // ==========================================
    const translations = ${isTw ? `{
        'File': '檔案',
        'Edit': '編輯',
        'View': '檢視',
        'Window': '視窗',
        'Help': '說明',
        'New Window': '開新視窗',
        'Create Project': '建立專案',
        'Command Palette': '命令面板',
        'Docs': '說明文件',
        'Check for Updates': '檢查更新',
        'Toggle Developer Tools': '切換開發人員工具',
        'Undo': '復原',
        'Redo': '取消復原',
        'Cut': '剪下',
        'Copy': '複製',
        'Paste': '貼上',
        'Select All': '全選',
        'Minimize': '最小化',
        'Maximize': '最大化',
        'Close': '關閉',
        'Zoom': '縮放',
        'Reset Zoom': '重設縮放',
        'Zoom In': '放大',
        'Zoom Out': '縮小',
        'Toggle Full Screen': '切換全螢幕',
        'Version': '版本'
    }` : `{
        'File': '文件',
        'Edit': '编辑',
        'View': '视图',
        'Window': '窗口',
        'Help': '帮助',
        'New Window': '新建窗口',
        'Create Project': '创建项目',
        'Command Palette': '命令面板',
        'Docs': '文档',
        'Check for Updates': '检查更新',
        'Toggle Developer Tools': '切换开发者工具',
        'Undo': '撤销',
        'Redo': '重做',
        'Cut': '剪切',
        'Copy': '复制',
        'Paste': '粘贴',
        'Select All': '全选',
        'Minimize': '最小化',
        'Maximize': '最大化',
        'Close': '关闭',
        'Zoom': '缩放',
        'Reset Zoom': '重置缩放',
        'Zoom In': '放大',
        'Zoom Out': '缩小',
        'Toggle Full Screen': '切换全屏',
        'Version': '版本'
    }`};
    function translateMenu(items) {
        for (const item of items) {
            let label = item.label || '';
            let mnemonic = '';
            let cleanLabel = label;
            const m = label.match(/&([a-zA-Z])/);
            if (m) {
                mnemonic = "(&" + m[1] + ")";
                cleanLabel = label.replace('&', '');
            }
            if (translations[cleanLabel]) {
                item.label = translations[cleanLabel] + mnemonic;
            } else if (translations[label]) {
                item.label = translations[label];
            } else if (/^Version\\s*([\\d\\.]*)$/i.test(cleanLabel)) {
                item.label = cleanLabel.replace(/^Version\\s*([\\d\\.]*)$/i, (match, v) => v ? "版本 " + v : "版本");
            }
            if (item.submenu && item.submenu.items) {
                translateMenu(item.submenu.items);
            }
        }
    }
    translateMenu(menu.items);
    `;

  const targetStr = 'electron_1.Menu.setApplicationMenu(menu);';
  const idx = cleaned.indexOf(targetStr);
  if (idx !== -1) {
    return cleaned.substring(0, idx) + menuTranslationJs + '\n    ' + cleaned.substring(idx);
  }
  return cleaned + '\n' + menuTranslationJs;
}

function unpatchMenuJs(content) {
  return cleanMenuJs(content);
}

function cleanTrayJs(content) {
  let cleaned = content;
  const startIdx = cleaned.indexOf(TRAY_START);
  const endIdx = cleaned.indexOf(TRAY_END);
  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    const before = cleaned.substring(0, startIdx).trimEnd();
    const after = cleaned.substring(endIdx + TRAY_END.length).trimStart();
    cleaned = before + '\n' + after;
  }

  // Restore updateTrayAgentCount label
  const countRegex = /countItem\.label\s*=\s*count\s*>\s*0\s*\?[\s\S]*?;/g;
  cleaned = cleaned.replace(countRegex, "countItem.label = (count > 0 ? `${count}` : 'No') + ' agents' + ' running';");

  return cleaned;
}

function patchTrayJs(content, options = {}) {
  const locale = normalizeLocale(options.locale || 'zh-CN');
  const isTw = locale === 'zh-TW';
  let cleaned = cleanTrayJs(content);

  const targetCreate = 'function createTray(actions) {';
  const replacementCreate = `function createTray(actions) {
    /* --- TRAY TRANSLATION START --- */
    const translations = ${isTw ? `{
        'No agents running': '無執行中的 Agent',
        'Open Antigravity': '開啟 Antigravity',
        'Quit': '結束'
    }` : `{
        'No agents running': '无运行中的 Agent',
        'Open Antigravity': '打开 Antigravity',
        'Quit': '退出'
    }`};
    for (const item of actions) {
        if (translations[item.label]) {
            item.label = translations[item.label];
        }
    }
    /* --- TRAY TRANSLATION END --- */`;

  let patched = cleaned.replace(targetCreate, replacementCreate);

  const countRegex = /countItem\.label\s*=\s*\([\s\S]*?' running';/g;
  const replacementCount = isTw
    ? "countItem.label = count > 0 ? `${count} 個 Agent 執行中` : '無執行中的 Agent';"
    : "countItem.label = count > 0 ? `${count} 个 Agent 运行中` : '无运行中的 Agent';";

  patched = patched.replace(countRegex, replacementCount);
  return patched;
}

function unpatchTrayJs(content) {
  return cleanTrayJs(content);
}

function patchLoadingOverlayJs(content, options = {}) {
  const locale = normalizeLocale(options.locale || 'zh-CN');
  const isTw = locale === 'zh-TW';

  const targetText = /<div class="text">Loading Antigravity<\/div>/g;
  const replacementText = isTw
    ? '<div class="text">Antigravity 正在載入中...</div>'
    : '<div class="text">Antigravity 正在加载中...</div>';

  return content.replace(targetText, replacementText);
}

function unpatchLoadingOverlayJs(content) {
  return content
    .replace(/<div class="text">Antigravity 正在加载中...<\/div>/g, '<div class="text">Loading Antigravity</div>')
    .replace(/<div class="text">Antigravity 正在載入中...<\/div>/g, '<div class="text">Loading Antigravity</div>');
}

function patchUpdaterJs(content, options = {}) {
  const locale = normalizeLocale(options.locale || 'zh-CN');
  const isTw = locale === 'zh-TW';

  let text = unpatchUpdaterJs(content);

  const titleReplacement = isTw ? "title: '檢查更新'" : "title: '检查更新'";
  const msgReplacement = isTw ? "message: '暫無可用更新'" : "message: '暂无可用更新'";
  const btnReplacement = isTw ? "buttons: ['確定']" : "buttons: ['确定']";

  text = text.replace(/title:\s*['"]Check for Updates['"]/g, titleReplacement);
  text = text.replace(/message:\s*['"]No updates available['"]/g, msgReplacement);
  text = text.replace(/buttons:\s*\[['"]OK['"]\]/g, btnReplacement);

  return text;
}

function unpatchUpdaterJs(content) {
  let text = content;
  text = text.replace(/title:\s*['"](?:检查更新|檢查更新)['"]/g, "title: 'Check for Updates'");
  text = text.replace(/message:\s*['"](?:暂无可用更新|暫無可用更新)['"]/g, "message: 'No updates available'");
  text = text.replace(/buttons:\s*\[['"](?:确定|確定)['"]\]/g, "buttons: ['OK']");
  return text;
}

/**
 * Patches all localization files inside an unpacked app directory (dist/).
 */
function patchDirectoryLocalization(unpackedDir, options = {}) {
  const distDir = path.join(unpackedDir, 'dist');
  const preloadPath = path.join(distDir, 'preload.js');
  const menuPath = path.join(distDir, 'menu.js');
  const trayPath = path.join(distDir, 'tray.js');
  const loadingPath = path.join(distDir, 'loadingOverlay.js');
  const updaterPath = path.join(distDir, 'updater.js');

  const results = {
    preload: false,
    menu: false,
    tray: false,
    loadingOverlay: false,
    updater: false,
  };

  if (fs.existsSync(preloadPath)) {
    const raw = fs.readFileSync(preloadPath, 'utf8');
    fs.writeFileSync(preloadPath, patchPreloadJs(raw, options), 'utf8');
    results.preload = true;
  }

  if (fs.existsSync(menuPath)) {
    const raw = fs.readFileSync(menuPath, 'utf8');
    fs.writeFileSync(menuPath, patchMenuJs(raw, options), 'utf8');
    results.menu = true;
  }

  if (fs.existsSync(trayPath)) {
    const raw = fs.readFileSync(trayPath, 'utf8');
    fs.writeFileSync(trayPath, patchTrayJs(raw, options), 'utf8');
    results.tray = true;
  }

  if (fs.existsSync(loadingPath)) {
    const raw = fs.readFileSync(loadingPath, 'utf8');
    fs.writeFileSync(loadingPath, patchLoadingOverlayJs(raw, options), 'utf8');
    results.loadingOverlay = true;
  }

  if (fs.existsSync(updaterPath)) {
    const raw = fs.readFileSync(updaterPath, 'utf8');
    fs.writeFileSync(updaterPath, patchUpdaterJs(raw, options), 'utf8');
    results.updater = true;
  }

  return results;
}

/**
 * Unpatches all localization files inside an unpacked app directory (dist/).
 */
function unpatchDirectoryLocalization(unpackedDir) {
  const distDir = path.join(unpackedDir, 'dist');
  const preloadPath = path.join(distDir, 'preload.js');
  const menuPath = path.join(distDir, 'menu.js');
  const trayPath = path.join(distDir, 'tray.js');
  const loadingPath = path.join(distDir, 'loadingOverlay.js');
  const updaterPath = path.join(distDir, 'updater.js');

  if (fs.existsSync(preloadPath)) {
    const raw = fs.readFileSync(preloadPath, 'utf8');
    fs.writeFileSync(preloadPath, unpatchPreloadJs(raw), 'utf8');
  }

  if (fs.existsSync(menuPath)) {
    const raw = fs.readFileSync(menuPath, 'utf8');
    fs.writeFileSync(menuPath, unpatchMenuJs(raw), 'utf8');
  }

  if (fs.existsSync(trayPath)) {
    const raw = fs.readFileSync(trayPath, 'utf8');
    fs.writeFileSync(trayPath, unpatchTrayJs(raw), 'utf8');
  }

  if (fs.existsSync(loadingPath)) {
    const raw = fs.readFileSync(loadingPath, 'utf8');
    fs.writeFileSync(loadingPath, unpatchLoadingOverlayJs(raw), 'utf8');
  }

  if (fs.existsSync(updaterPath)) {
    const raw = fs.readFileSync(updaterPath, 'utf8');
    fs.writeFileSync(updaterPath, unpatchUpdaterJs(raw), 'utf8');
  }
}

/**
 * macOS Ad-hoc deep re-signing.
 */
function resignAppOnMac(anyPath) {
  if (process.platform !== 'darwin') return { success: true, skipped: true };

  let targetApp = '';
  let current = path.resolve(anyPath);
  for (let i = 0; i < 10; i++) {
    if (current.endsWith('.app')) {
      targetApp = current;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (targetApp && fs.existsSync(targetApp)) {
    try {
      const out = child_process.execSync(`codesign --force --deep --sign - "${targetApp}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { success: true, stdout: out };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return { success: false, message: 'Could not find .app bundle' };
}

// ------------------------------------------------------------
// Antigravity 1.0 Legacy HTML Architecture Support
// ------------------------------------------------------------
const OLD_TARGET_FILES = [
  path.join('resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench-jetski-agent.html'),
  path.join('resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'),
];

function backupFiles10(installDir) {
  for (const relPath of OLD_TARGET_FILES) {
    const absPath = path.join(installDir, relPath);
    const bakPath = absPath + '.bak';
    if (fs.existsSync(absPath) && !fs.existsSync(bakPath)) {
      fs.copyFileSync(absPath, bakPath);
    }
  }
}

function injectHtml10(installDir, htmlRelPath) {
  const absPath = path.join(installDir, htmlRelPath);
  if (!fs.existsSync(absPath)) return false;

  let content = fs.readFileSync(absPath, 'utf8');
  const injectStr = '<script src="../../../../ag_agent_hanhua.js"></script>';
  content = content.replace(/<script.*ag_agent_hanhua\.js.*><\/script>/g, '');

  if (content.includes('</body>')) {
    content = content.replace('</body>', `${injectStr}</body>`);
  } else {
    content += injectStr;
  }

  fs.writeFileSync(absPath, content, 'utf8');
  return true;
}

function updateChecksums10(installDir) {
  const productJsonPath = path.join(installDir, 'resources', 'app', 'product.json');
  if (!fs.existsSync(productJsonPath)) return;

  try {
    const data = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
    if (!data.checksums) data.checksums = {};

    for (const relPath of OLD_TARGET_FILES) {
      const absPath = path.join(installDir, relPath);
      if (fs.existsSync(absPath)) {
        const key = relPath.replace(/\\/g, '/').replace('resources/app/out/', '');
        const fileBuffer = fs.readFileSync(absPath);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest();
        data.checksums[key] = hash.toString('base64').replace(/=/g, '');
      }
    }

    fs.writeFileSync(productJsonPath, JSON.stringify(data, null, '\t'), 'utf8');
  } catch (_) {}
}

function install10(installDir, options = {}) {
  backupFiles10(installDir);

  const hanhuaJsPath = path.join(installDir, 'resources', 'app', 'out', 'ag_agent_hanhua.js');
  fs.mkdirSync(path.dirname(hanhuaJsPath), { recursive: true });

  const jsContent = generatePreloadJs(options);
  fs.writeFileSync(hanhuaJsPath, jsContent, 'utf8');

  for (const html of OLD_TARGET_FILES) {
    injectHtml10(installDir, html);
  }

  updateChecksums10(installDir);
  resignAppOnMac(installDir);
  return true;
}

function restore10(installDir) {
  let changed = false;
  for (const relPath of OLD_TARGET_FILES) {
    const absPath = path.join(installDir, relPath);
    const bakPath = absPath + '.bak';
    if (fs.existsSync(bakPath)) {
      fs.copyFileSync(bakPath, absPath);
      fs.unlinkSync(bakPath);
      changed = true;
    }
  }

  const hanhuaJsPath = path.join(installDir, 'resources', 'app', 'out', 'ag_agent_hanhua.js');
  if (fs.existsSync(hanhuaJsPath)) {
    try { fs.unlinkSync(hanhuaJsPath); } catch (_) {}
    changed = true;
  }

  if (changed) {
    updateChecksums10(installDir);
    resignAppOnMac(installDir);
  }
  return true;
}

module.exports = {
  SIGNATURE_START,
  SIGNATURE_END,
  BRAND_TITLE_ALIASES,
  normalizeBrandTitleMode,
  normalizeLocale,
  normalizeText,
  resolveDictsDir,
  loadDictionary,
  generatePreloadJs,
  cleanPreloadJs,
  isPatchedLocalization,
  detectPatchedLocale,
  patchPreloadJs,
  unpatchPreloadJs,
  cleanMenuJs,
  patchMenuJs,
  unpatchMenuJs,
  cleanTrayJs,
  patchTrayJs,
  unpatchTrayJs,
  patchLoadingOverlayJs,
  unpatchLoadingOverlayJs,
  patchUpdaterJs,
  unpatchUpdaterJs,
  patchDirectoryLocalization,
  unpatchDirectoryLocalization,
  resignAppOnMac,
  backupFiles10,
  injectHtml10,
  updateChecksums10,
  install10,
  restore10,
};
