"use strict";

/**
 * Agent Status Observer
 * 
 * Extracts real-time agent execution metrics, thinking duration, active tool calls,
 * and pending user questions (Ask Question dialogs / Proceed buttons) from the
 * Antigravity renderer DOM, forwarding updates to the desktop floating widget via IPC.
 * 
 * Strictly contains NO emojis in code or UI outputs (100% SVG vector icon compatible).
 */

/**
 * Parses individual step text from Antigravity DOM into structured activity object.
 * @param {string} rawText 
 * @returns {object|null}
 */
function parseStepText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText.replace(/\r/g, '').trim();

  // If delimited by pipe '|'
  if (cleaned.includes('|')) {
    const parts = cleaned.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const verb = parts[0];

    if (/^(Edited|Modified|修改)/i.test(verb)) {
      const target = parts[1] || 'File';
      let addLines = 0;
      let delLines = 0;
      let diffStr = '';

      for (let i = 2; i < parts.length; i++) {
        const p = parts[i];
        const addMatch = p.match(/^\+(\d+)/);
        if (addMatch) {
          addLines += parseInt(addMatch[1], 10);
        }
        const delMatch = p.match(/^-(\d+)/);
        if (delMatch) {
          delLines += parseInt(delMatch[1], 10);
        }
      }

      if (addLines > 0 || delLines > 0) {
        diffStr = `+${addLines} -${delLines}`;
      }

      return {
        type: 'edit',
        text: target,
        diff: diffStr,
        addLines,
        delLines,
      };
    }

    if (/^(Explored|Exploring|Read|Reading|Viewed|Viewing|Analyzed|Analyzing|讀取|探索|已探索|分析|已分析)/i.test(verb)) {
      const target = (parts[1] || 'Files').replace(/^(?:js|ts|jsx|tsx|py|html|css|json|md|sh|bat)\s+/i, '');
      const mCount = target.match(/^(\d+)\s+files?/i);
      const count = mCount ? parseInt(mCount[1], 10) : 1;
      const mFileOnly = target.match(/^([a-zA-Z0-9_\-\.\/\\\~]+?\.[a-zA-Z0-9]+)/);
      return {
        type: 'read',
        text: target,
        fileName: mFileOnly ? mFileOnly[1] : target,
        diff: '',
        addLines: 0,
        delLines: 0,
        count,
      };
    }

    if (/^(Ran|Executed|Command|執行)/i.test(verb)) {
      const cmd = parts[1] || 'Command';
      return {
        type: 'cmd',
        text: cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd,
        diff: '',
        addLines: 0,
        delLines: 0,
        count: 1,
      };
    }
  }

  // Single-line DOM format (e.g. "Edited foo.js +10 -2", "Ran git status", "Explored 23 files", "Analyzed test.js #L1-100")
  const mEdit = cleaned.match(/^(?:Edited|Modified|修改)\s+(?:<>\s*)?(?:(?:js|ts|jsx|tsx|py|html|css|json|md|sh|bat)\s+)?([^\n+\-]+?)(?:\s+\+(\d+))?(?:\s+-(\d+))?$/i);
  if (mEdit) {
    const target = mEdit[1].trim();
    const addLines = mEdit[2] ? parseInt(mEdit[2], 10) : 0;
    const delLines = mEdit[3] ? parseInt(mEdit[3], 10) : 0;
    const diffStr = (addLines > 0 || delLines > 0) ? `+${addLines} -${delLines}` : '';
    return {
      type: 'edit',
      text: target,
      diff: diffStr,
      addLines,
      delLines,
    };
  }

  const mCmdGroup = cleaned.match(/^(?:Ran|Run|Executed|執行中?|已執行)?\s*(\d+)\s*(?:commands?|個?(?:指令|命令))$/i);
  if (mCmdGroup) {
    const count = parseInt(mCmdGroup[1], 10);
    return {
      type: 'cmd',
      text: `${count} 個終端指令`,
      diff: '',
      addLines: 0,
      delLines: 0,
      count,
    };
  }

  const mCmd = cleaned.match(/^(?:Ran|Run|Executed|執行)\s+(.+)$/i);
  if (mCmd) {
    let cmd = mCmd[1].trim();
    cmd = cmd.replace(/[^\s"'\(\)]*[\\/]\.gemini[\\/]antigravity[\\/]brain[\\/][^\\/]+[\\/]scratch[\\/]/gi, 'scratch/');
    if (cmd.startsWith('node scratch/')) {
      cmd = cmd.replace(/^node scratch\//, '');
    }
    return {
      type: 'cmd',
      text: cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd,
      diff: '',
      addLines: 0,
      delLines: 0,
      count: 1,
    };
  }

  const mRead = cleaned.match(/^(?:Explored|Exploring|Analyzed|Analyzing|Read|Reading|Viewed|Viewing|讀取|已探索|探索|分析|已分析)\s+(?:(?:js|ts|jsx|tsx|py|html|css|json|md|sh|bat|file|files)\s+)?(.+)$/i);
  if (mRead) {
    let rawTarget = mRead[1].trim();
    rawTarget = rawTarget.replace(/\s*[>v]\s*$/, '').trim();
    const mFiles = rawTarget.match(/^(\d+)\s+files?/i);
    const count = mFiles ? parseInt(mFiles[1], 10) : 1;
    const mFileOnly = rawTarget.match(/^([a-zA-Z0-9_\-\.\/\\\~]+?\.[a-zA-Z0-9]+)/);
    return {
      type: 'read',
      text: rawTarget,
      fileName: mFileOnly ? mFileOnly[1] : rawTarget,
      diff: '',
      addLines: 0,
      delLines: 0,
      count,
    };
  }

  return null;
}

/**
 * Extracts aggregate metrics from a collection of raw step texts.
 * @param {string[]} stepTexts 
 * @returns {object}
 */
function extractMetrics(stepTexts) {
  const result = {
    readCount: 0,
    editCount: 0,
    addLines: 0,
    delLines: 0,
    cmdCount: 0,
    activities: [],
  };

  if (!Array.isArray(stepTexts)) return result;

  const seenEdits = new Set();
  const seenReadFiles = new Set();
  const seenActKeys = new Set();
  let groupReadCount = 0;

  for (const raw of stepTexts) {
    const parsed = parseStepText(raw);
    if (!parsed) continue;

    const actKey = `${parsed.type}:${parsed.text.replace(/\s+/g, ' ')}${parsed.diff ? ':' + parsed.diff : ''}`;
    if (!seenActKeys.has(actKey)) {
      seenActKeys.add(actKey);
      result.activities.push({
        type: parsed.type,
        text: parsed.text,
        diff: parsed.diff,
      });
    }

    if (parsed.type === 'edit') {
      seenEdits.add(parsed.text);
      result.addLines += parsed.addLines;
      result.delLines += parsed.delLines;
    } else if (parsed.type === 'read') {
      if (parsed.count && parsed.count > 1) {
        groupReadCount = Math.max(groupReadCount, parsed.count);
      } else {
        seenReadFiles.add(parsed.fileName || parsed.text);
      }
    } else if (parsed.type === 'cmd') {
      result.cmdCount += (parsed.count || 1);
    }
  }

  result.editCount = seenEdits.size || (result.addLines > 0 ? 1 : 0);
  result.readCount = Math.max(groupReadCount + seenReadFiles.size, groupReadCount, seenReadFiles.size);

  return result;
}

/**
 * Deduces agent state based on UI indicators.
 * @param {object} params
 * @returns {{ status: string, statusText: string }}
 */
function deduceAgentStatus({ hasAsk, isWorking, thinkingText, lastActionText, hasResponse }) {
  if (hasAsk) {
    return { status: 'ask', statusText: '等待使用者決策' };
  }
  if (isWorking) {
    if (thinkingText) {
      return { status: 'thinking', statusText: thinkingText };
    }
    if (lastActionText) {
      return { status: 'running', statusText: `執行: ${lastActionText}` };
    }
    return { status: 'running', statusText: 'Agent 運作中...' };
  }
  if (hasResponse) {
    return { status: 'completed', statusText: '任務已完成' };
  }
  return { status: 'idle', statusText: '待命中' };
}

/**
 * Generates the self-contained JavaScript string to be injected into the Antigravity main window.
 * @returns {string}
 */
function getObserverScript() {
  return `
(function() {
  if (window.__agStatusObserverInitialized) return;
  window.__agStatusObserverInitialized = true;

  var electron = null;
  try {
    if (window.require) {
      electron = window.require('electron');
    }
  } catch (_) {}

  var ipc = electron ? electron.ipcRenderer : null;
  var lastPayloadJson = '';

  function scrapeDom() {
    try {
      // 1. Detect Ask Question or Proceed modal / card
      var askInfo = null;
      var optionButtons = [];
      var submitButtonEl = null;
      var askFound = false;

      function extractCardData(cardEl, submitBtn) {
        var lines = (cardEl.innerText || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
        var qTitle = '';
        for (var l = 0; l < lines.length; l++) {
          var ln = lines[l];
          if (/^(Asking \d+ question|Waiting for user input\.\.\.|Waiting for user input|跳過|Skip|提交|Submit)$/i.test(ln)) {
            continue;
          }
          if (!qTitle) qTitle = ln;
          if (ln.indexOf('？') !== -1 || ln.indexOf('?') !== -1) {
            qTitle = ln;
            break;
          }
        }

        var opts = [];
        var btnList = [];

        var allCardBtns = cardEl.querySelectorAll('button, [role="button"]');
        for (var b = 0; b < allCardBtns.length; b++) {
          var btn = allCardBtns[b];
          var bt = (btn.innerText || btn.textContent || '').trim();
          if (!bt || /^(Submit|送出|提交|確認送出|確定|Skip|略過|跳過|關閉|Close|X)$/i.test(bt)) {
            continue;
          }
          if (/^(一般|通用|常規|常规|外觀|外观|模型|自訂設定|自定义设置|瀏覽器|浏览器|帳號|账号|賬戶|账户|偏好設定|偏好设置|設定|设置|General|Appearance|Models|Account|Feedback|About)$/i.test(bt)) {
            continue;
          }
          var cleanText = bt.replace(/^\s*\d+[\s\.\:\、\)]*/, '').trim() || bt;
          if (opts.indexOf(cleanText) === -1) {
            opts.push(cleanText);
            btnList.push(btn);
          }
        }

        if (opts.length === 0) {
          var radioEls = cardEl.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"], label');
          for (var r = 0; r < radioEls.length; r++) {
            var rel = radioEls[r];
            var rt = (rel.innerText || rel.textContent || '').trim();
            if (!rt || /^(Submit|送出|提交|確認送出|確定|Skip|略過|跳過)$/i.test(rt)) continue;
            var cleanRt = rt.replace(/^\s*\d+[\s\.\:\、\)]*/, '').trim() || rt;
            if (opts.indexOf(cleanRt) === -1) {
              opts.push(cleanRt);
              btnList.push(rel);
            }
          }
        }

        if (opts.length === 0) {
          var allDescendants = cardEl.querySelectorAll('div, li, p');
          for (var d = 0; d < allDescendants.length; d++) {
            var dEl = allDescendants[d];
            if (dEl.children.length > 4) continue;
            var dt = (dEl.innerText || '').trim();
            var mNum = dt.match(/^(\d+)[\s\.\:\、\)]+(.+)/s);
            if (mNum && mNum[1] && mNum[2]) {
              var optText = mNum[2].trim();
              if (optText && opts.indexOf(optText) === -1) {
                opts.push(optText);
                btnList.push(dEl);
              }
            } else if (/^\(Recommended\)|^Other\b/i.test(dt) && opts.indexOf(dt) === -1) {
              opts.push(dt);
              btnList.push(dEl);
            }
          }
        }

        if (opts.length === 0) {
          for (var pl = 0; pl < lines.length; pl++) {
            var lineText = lines[pl];
            if (/^(Asking|Waiting|跳過|Skip|提交|Submit|Close|關閉)/i.test(lineText)) continue;
            if (lineText === qTitle) continue;
            var m = lineText.match(/^(\d+)[\s\.\:\、\)]+(.+)/);
            if (m && m[2].trim()) {
              opts.push(m[2].trim());
            } else if (/^\(Recommended\)|^Other\b/i.test(lineText)) {
              opts.push(lineText);
            }
          }
        }

        return {
          question: qTitle || '需要您的確認或決策',
          options: opts,
          optionButtons: btnList,
          submitButton: submitBtn
        };
      }

      // 1.1 Strategy A: Find inline question card via action buttons (Submit / 提交 / 送出)
      var allButtons = document.querySelectorAll('button, [role="button"]');
      for (var bIdx = 0; bIdx < allButtons.length; bIdx++) {
        var btn = allButtons[bIdx];
        var btnText = (btn.innerText || btn.textContent || '').trim();
        if (/^(Submit|送出|提交|確認送出|確定)$/i.test(btnText) || /^提交\b/i.test(btnText) || /^Submit\b/i.test(btnText)) {
          var rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            var curr = btn.parentElement;
            var matchedCard = null;
            for (var depth = 0; depth < 8 && curr && curr !== document.body && curr !== document.documentElement; depth++) {
              var attr = (curr.className || '') + ' ' + (curr.getAttribute('aria-label') || '') + ' ' + (curr.id || '');
              if (/settings|preferences|feedback|about|menubar|context-menu/i.test(attr)) {
                break;
              }
              var cText = curr.innerText || '';
              if (cText.indexOf('應用程式設定') !== -1 || cText.indexOf('应用程序设置') !== -1 || ((cText.indexOf('外觀') !== -1 || cText.indexOf('外观') !== -1) && (cText.indexOf('模型') !== -1 || cText.indexOf('通用') !== -1 || cText.indexOf('常规') !== -1))) {
                break;
              }
              if (cText.indexOf('？') !== -1 || cText.indexOf('?') !== -1 || /Waiting for user input|Asking \d+ question|Recommended|Other/i.test(cText)) {
                matchedCard = curr;
                if (/form|rounded|card|border/i.test(curr.className || '') || cText.indexOf('Waiting for user input') !== -1) {
                  break;
                }
              }
              curr = curr.parentElement;
            }

            if (matchedCard) {
              var cardData = extractCardData(matchedCard, btn);
              if (cardData.options.length >= 1) {
                askInfo = {
                  question: cardData.question,
                  options: cardData.options
                };
                optionButtons = cardData.optionButtons;
                submitButtonEl = cardData.submitButton;
                askFound = true;
                break;
              }
            }
          }
        }
      }

      // 1.2 Strategy B: Find via "Waiting for user input" indicator
      if (!askFound) {
        var allTextNodes = document.querySelectorAll('div, span, p');
        for (var tni = 0; tni < allTextNodes.length; tni++) {
          var tn = allTextNodes[tni];
          var tnText = (tn.innerText || '').trim();
          if (tnText === 'Waiting for user input...' || tnText === 'Waiting for user input' || /^Asking \d+ question/i.test(tnText)) {
            var pNode = tn.parentElement;
            while (pNode && pNode !== document.body) {
              var pBtns = pNode.querySelectorAll('button');
              if (pBtns.length >= 2) {
                var sBtnMatch = null;
                for (var pbi = 0; pbi < pBtns.length; pbi++) {
                  var pbt = (pBtns[pbi].innerText || '').trim();
                  if (/^(Submit|送出|提交|確認送出|確定)$/i.test(pbt) || /^提交\b/i.test(pbt) || /^Submit\b/i.test(pbt)) {
                    sBtnMatch = pBtns[pbi];
                    break;
                  }
                }
                var pData = extractCardData(pNode, sBtnMatch);
                if (pData.options.length >= 1) {
                  askInfo = {
                    question: pData.question,
                    options: pData.options
                  };
                  optionButtons = pData.optionButtons;
                  submitButtonEl = pData.submitButton;
                  askFound = true;
                  break;
                }
              }
              pNode = pNode.parentElement;
            }
            if (askFound) break;
          }
        }
      }

      // 1.3 Strategy C: Check dialog elements
      if (!askFound) {
        var dialogs = document.querySelectorAll('[role="dialog"], [class*="dialog"], [class*="modal"]');
        for (var d = 0; d < dialogs.length; d++) {
          var dlg = dialogs[d];
          var dlgText = dlg.innerText || '';

          var dlgAttr = (dlg.className || '') + ' ' + (dlg.getAttribute('aria-label') || '') + ' ' + (dlg.id || '');
          if (/settings|preferences|feedback|about|menubar|context-menu/i.test(dlgAttr)) {
            continue;
          }
          var dLines = dlgText.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
          var dTitle = dLines[0] || '';
          if (/^(設定|Settings|Preferences|设置|偏好設定|偏好设置|意見回饋|意见反馈|Feedback|關於|关于|鍵盤快捷鍵|键盘快捷键|Keyboard Shortcuts|自定义设置|自訂設定)$/i.test(dTitle)) {
            continue;
          }
          if (dlgText.indexOf('應用程式設定') !== -1 || dlgText.indexOf('应用程序设置') !== -1 || ((dlgText.indexOf('外觀') !== -1 || dlgText.indexOf('外观') !== -1) && (dlgText.indexOf('模型') !== -1 || dlgText.indexOf('通用') !== -1 || dlgText.indexOf('常规') !== -1))) {
            continue;
          }
          if (/General|Appearance|Models|Account|通用|常规|外观|模型|账号|账户/i.test(dlgText) && /Settings|Preferences|設定|设置|首选项|偏好設定|偏好设置/i.test(dlgText)) {
            continue;
          }

          var hasSubmitOrSkip = false;
          var allDlgBtns = dlg.querySelectorAll('button');
          var dlgSubmitBtn = null;
          for (var sbIdx = 0; sbIdx < allDlgBtns.length; sbIdx++) {
            var sbText = (allDlgBtns[sbIdx].innerText || '').trim();
            if (/^(Submit|送出|提交|確認送出|確定|Skip|略過|跳過)$/i.test(sbText)) {
              hasSubmitOrSkip = true;
              if (/^(Submit|送出|提交|確認送出|確定)$/i.test(sbText)) {
                dlgSubmitBtn = allDlgBtns[sbIdx];
              }
            }
          }
          var optionInputs = dlg.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="option"], [data-option]');

          if (!hasSubmitOrSkip && optionInputs.length === 0) {
            continue;
          }

          var opts = [];
          var btnList = [];
          for (var b = 0; b < allDlgBtns.length; b++) {
            var bt = allDlgBtns[b].innerText.trim();
            if (bt && !/^(關閉|Close|X|Submit|送出|提交|確認送出|確定|Skip|略過|跳過)$/i.test(bt)) {
              if (!/^(一般|外觀|模型|自訂設定|瀏覽器|General|Appearance|Models|Account)$/i.test(bt)) {
                opts.push(bt);
                btnList.push(allDlgBtns[b]);
              }
            }
          }
          if (opts.length >= 2 || (hasSubmitOrSkip && opts.length >= 1)) {
            askInfo = { question: dTitle || '需要您的確認或決策', options: opts };
            optionButtons = btnList;
            submitButtonEl = dlgSubmitBtn;
            askFound = true;
            break;
          }
        }
      }

      // 1.4 Strategy D: Check for Proceed / Approve banner
      if (!askFound) {
        var allBtns = document.querySelectorAll('button');
        for (var i = 0; i < allBtns.length; i++) {
          var bText = (allBtns[i].innerText || '').trim();
          if (/^(Proceed|Approve|同意執行|繼續執行)/i.test(bText)) {
            var rect = allBtns[i].getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              askInfo = {
                question: '任務執行計畫已就緒，等待您的批准',
                options: [bText, '檢視計畫詳情']
              };
              optionButtons = [allBtns[i]];
              askFound = true;
              break;
            }
          }
        }
      }

      window.__agOptionButtons = optionButtons;
      window.__agSubmitButton = submitButtonEl;

      // 2. Scrape files changed & diff metrics from header
      var filesChangedCount = 0;
      var totalAdd = 0;
      var totalDel = 0;

      var fHeaders = document.querySelectorAll('.files-changed-header');
      for (var fh = 0; fh < fHeaders.length; fh++) {
        var fht = (fHeaders[fh].innerText || '').trim();
        var mf = fht.match(/(\d+)\s+file/i);
        if (mf) {
          var fc = parseInt(mf[1], 10);
          if (fc > filesChangedCount) filesChangedCount = fc;
        }
        var ma = fht.match(/\+(\d+)/);
        if (ma) {
          var fa = parseInt(ma[1], 10);
          if (fa > totalAdd) totalAdd = fa;
        }
        var md = fht.match(/-(\d+)/);
        if (md) {
          var fd = parseInt(md[1], 10);
          if (fd > totalDel) totalDel = fd;
        }
      }

      // 3. Scrape step action nodes across DOM
      var activities = [];
      var seenActKeys = {};
      var seenEdits = {};
      var seenReadFiles = {};
      var groupReadCount = 0;
      var cmdCount = 0;

      var allStepNodes = document.querySelectorAll(
        'div.flex.flex-row.items-center.gap-1, button[class*="tabular-nums"], div.truncate, ' +
        '[class*="step-row"], [class*="action-row"], div[class*="leading-relaxed"] div.truncate'
      );
      for (var sn = 0; sn < allStepNodes.length; sn++) {
        var raw = (allStepNodes[sn].innerText || '').trim().replace(/\s+/g, ' ');
        if (!raw) continue;
        raw = raw.replace(/\s*[>v]\s*$/, '').trim();

        // 3.1 Pattern: Edited <file> +X -Y
        var mEdit = raw.match(/^(?:Edited|Modified|修改)\s+(?:<>\s*)?(?:(?:js|ts|jsx|tsx|py|html|css|json|md|sh|bat)\s+)?([^\n+\-]+?)(?:\s+\+(\d+))?(?:\s+-(\d+))?$/i);
        if (mEdit) {
          var fName = mEdit[1].trim();
          var add = mEdit[2] ? parseInt(mEdit[2], 10) : 0;
          var del = mEdit[3] ? parseInt(mEdit[3], 10) : 0;
          var diffStr = (add > 0 || del > 0) ? ('+' + add + ' -' + del) : '';
          var eKey = 'edit:' + fName + (diffStr ? ':' + diffStr : '');
          if (!seenActKeys[eKey]) {
            seenActKeys[eKey] = true;
            seenEdits[fName] = true;
            activities.push({ type: 'edit', text: fName, diff: diffStr });
          }
          continue;
        }

        // 3.2 Pattern: Ran <N> commands
        var mCmdGroup = raw.match(/^(?:Ran|Run|Executed|執行中?|已執行)?\s*(\d+)\s*(?:commands?|個?(?:指令|命令))$/i);
        if (mCmdGroup) {
          var nCmds = parseInt(mCmdGroup[1], 10);
          var cgKey = 'cmd:group:' + nCmds;
          if (!seenActKeys[cgKey]) {
            seenActKeys[cgKey] = true;
            cmdCount += nCmds;
            activities.push({ type: 'cmd', text: nCmds + ' 個終端指令', diff: '' });
          }
          continue;
        }

        // 3.3 Pattern: Ran <cmd>
        var mCmd = raw.match(/^(?:Ran|Run|Executed|執行)\s+(.+)$/i);
        if (mCmd) {
          var cmd = mCmd[1].trim();
          cmd = cmd.replace(/[^\s"'\(\)]*[\\/]\.gemini[\\/]antigravity[\\/]brain[\\/][^\\/]+[\\/]scratch[\\/]/gi, 'scratch/');
          if (cmd.indexOf('node scratch/') === 0) {
            cmd = cmd.replace(/^node scratch\//, '');
          }
          var cmdKey = 'cmd:' + cmd;
          if (!seenActKeys[cmdKey]) {
            seenActKeys[cmdKey] = true;
            cmdCount++;
            activities.push({ type: 'cmd', text: cmd.length > 50 ? cmd.slice(0, 47) + '...' : cmd, diff: '' });
          }
          continue;
        }

        // 3.4 Pattern: Explored / Exploring / Analyzed / Analyzing / Read
        var mRead = raw.match(/^(?:Explored|Exploring|Analyzed|Analyzing|Read|Reading|Viewed|Viewing|讀取|已探索|探索|分析|已分析)\s+(?:(?:js|ts|jsx|tsx|py|html|css|json|md|sh|bat|file|files)\s+)?(.+)$/i);
        if (mRead) {
          var rTarget = mRead[1].trim().replace(/\s*[>v]\s*$/, '').trim();
          var mCount = rTarget.match(/^(\d+)\s+files?/i);
          var count = mCount ? parseInt(mCount[1], 10) : 1;
          var mFileOnly = rTarget.match(/^([a-zA-Z0-9_\-\.\/\\\~]+?\.[a-zA-Z0-9]+)/);
          var fBase = mFileOnly ? mFileOnly[1] : rTarget;

          if (count > 1) {
            groupReadCount = Math.max(groupReadCount, count);
          } else {
            seenReadFiles[fBase] = true;
          }

          var rKey = 'read:' + rTarget;
          if (!seenActKeys[rKey]) {
            seenActKeys[rKey] = true;
            activities.push({ type: 'read', text: rTarget, diff: '' });
          }
          continue;
        }
      }

      // Check terminal font-mono command headers to never miss commands
      var termSpans = document.querySelectorAll('span.font-mono, div.font-mono');
      for (var ts = 0; ts < termSpans.length; ts++) {
        var tText = (termSpans[ts].innerText || '').trim();
        if (tText.indexOf('node ') === 0 || tText.indexOf('npm ') === 0 || tText.indexOf('git ') === 0) {
          var tKey = 'cmd:' + tText;
          if (!seenActKeys[tKey]) {
            seenActKeys[tKey] = true;
            var cClean = tText.replace(/[^\s"'\(\)]*[\\/]\.gemini[\\/]antigravity[\\/]brain[\\/][^\\/]+[\\/]scratch[\\/]/gi, 'scratch/');
            cmdCount++;
            activities.push({ type: 'cmd', text: cClean.length > 50 ? cClean.slice(0, 47) + '...' : cClean, diff: '' });
          }
        }
      }

      var readCount = Math.max(groupReadCount + Object.keys(seenReadFiles).length, groupReadCount, Object.keys(seenReadFiles).length, activities.filter(function(a) { return a.type === 'read'; }).length);
      var editCount = Math.max(filesChangedCount, Object.keys(seenEdits).length);

      // 4. Detect thinking / running / working state with live second timer
      var hasActiveWorkingText = false;
      var hasThinking = false;
      var allCheckNodes = document.querySelectorAll('button, div[class*="step"], span, p');
      for (var ci = 0; ci < allCheckNodes.length; ci++) {
        var cTxt = (allCheckNodes[ci].innerText || '').trim();
        if (/^Working\.{0,3}$/i.test(cTxt) || /^處理中\.{0,3}$/i.test(cTxt) || /^正在生成\.{0,3}$/i.test(cTxt) || /^Generating\.{0,3}$/i.test(cTxt)) {
          var cRect = allCheckNodes[ci].getBoundingClientRect();
          if (cRect.width > 0 && cRect.height > 0) {
            hasActiveWorkingText = true;
            break;
          }
        }
        if (/^Thinking\.{0,3}$/i.test(cTxt) || /^思考中\.{0,3}$/i.test(cTxt)) {
          var tRect = allCheckNodes[ci].getBoundingClientRect();
          if (tRect.width > 0 && tRect.height > 0) {
            hasThinking = true;
            hasActiveWorkingText = true;
            break;
          }
        }
      }

      var hasStopButton = false;
      var candidateStopButtons = document.querySelectorAll(
        'button[aria-label*="Stop" i], button[title*="Stop" i], ' +
        'button[aria-label*="停止"], button[title*="停止"], ' +
        'button[aria-label*="中斷"], button[title*="中斷"]'
      );
      for (var sbi = 0; sbi < candidateStopButtons.length; sbi++) {
        var sBtn = candidateStopButtons[sbi];
        var sRect = sBtn.getBoundingClientRect();
        if (sRect.width > 0 && sRect.height > 0) {
          var sLabel = (sBtn.getAttribute('aria-label') || sBtn.getAttribute('title') || sBtn.innerText || '').trim();
          if (/^(Stop(\s+(generating|response|agent|execution|run))?|停止(生成|回應|執行)?|中斷)$/i.test(sLabel) ||
              /^(Stop generating|停止生成|停止回應)/i.test(sLabel)) {
            hasStopButton = true;
            break;
          }
        }
      }

      var hasChatSpinner = false;
      var spinners = document.querySelectorAll('.animate-spin, svg.animate-spin, [class*="animate-spin"]');
      for (var spi = 0; spi < spinners.length; spi++) {
        var sp = spinners[spi];
        var spRect = sp.getBoundingClientRect();
        if (spRect.width > 0 && spRect.height > 0) {
          var insideChat = sp.closest('[class*="chat"], [class*="message"], [class*="step"], [class*="conversation"], [class*="timeline"]');
          if (insideChat) {
            var compStyle = window.getComputedStyle ? window.getComputedStyle(sp) : null;
            if (!compStyle || (compStyle.display !== 'none' && compStyle.visibility !== 'hidden' && compStyle.opacity !== '0')) {
              hasChatSpinner = true;
              break;
            }
          }
        }
      }

      var isWorking = hasStopButton || hasActiveWorkingText || hasChatSpinner;

      if (isWorking) {
        if (!window.__ag_work_start_time) {
          window.__ag_work_start_time = Date.now();
        }
      } else {
        window.__ag_work_start_time = null;
      }

      var elapsedSec = window.__ag_work_start_time ? Math.max(1, Math.floor((Date.now() - window.__ag_work_start_time) / 1000)) : 0;

      // 5. Scrape latest AI Agent response text
      var responseInfo = null;
      var aiResponseEls = document.querySelectorAll('div.leading-relaxed.select-text');
      if (aiResponseEls.length > 0) {
        var lastAiEl = aiResponseEls[aiResponseEls.length - 1];
        var rawAiText = (lastAiEl.innerText || '').trim();
        if (rawAiText) {
          var lines = rawAiText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
          var snippet = '';
          for (var li = 0; li < lines.length; li++) {
            if (lines[li].indexOf('#') !== 0 && lines[li].indexOf('---') !== 0) {
              snippet = lines[li];
              break;
            }
          }
          if (!snippet && lines.length > 0) snippet = lines[0];
          if (snippet.length > 150) snippet = snippet.slice(0, 147) + '...';

          responseInfo = {
            snippet: snippet,
            full: rawAiText.slice(0, 1200)
          };
        }
      }

      // Compute status with live real-time ticking
      var status = 'idle';
      var statusText = '待命中';
      if (askFound) {
        status = 'ask';
        statusText = '等待使用者決策';
        responseInfo = null;
      } else if (isWorking) {
        var lastAct = activities.length > 0 ? activities[activities.length - 1] : null;
        if (hasThinking) {
          status = 'thinking';
          statusText = '思考中 (' + elapsedSec + 's)...';
        } else if (lastAct && lastAct.type === 'read') {
          status = 'running';
          var rName = lastAct.text.replace(/^[^\w\.\-\/]+/, '');
          if (rName.length > 22) rName = rName.slice(0, 19) + '...';
          statusText = '分析: ' + rName + ' (' + elapsedSec + 's)...';
        } else if (lastAct && lastAct.type === 'cmd') {
          status = 'running';
          var cName = lastAct.text;
          if (cName.length > 22) cName = cName.slice(0, 19) + '...';
          statusText = '執行: ' + cName + ' (' + elapsedSec + 's)...';
        } else if (lastAct && lastAct.type === 'edit') {
          status = 'running';
          var eName = lastAct.text;
          if (eName.length > 22) eName = eName.slice(0, 19) + '...';
          statusText = '修改: ' + eName + ' (' + elapsedSec + 's)...';
        } else {
          status = 'running';
          statusText = '執行中 (' + elapsedSec + 's)...';
        }
      } else if (responseInfo) {
        status = 'completed';
        statusText = '任務已完成';
      }

      var payload = {
        status: status,
        statusText: statusText,
        readCount: readCount,
        editCount: editCount,
        addLines: totalAdd,
        delLines: totalDel,
        cmdCount: cmdCount,
        ask: askInfo,
        activities: activities.slice(-100),
        response: responseInfo
      };

      var payloadJson = JSON.stringify(payload);
      if (payloadJson !== lastPayloadJson) {
        lastPayloadJson = payloadJson;
        if (ipc) {
          ipc.send('ag-status-sync', payload);
        }
      }
    } catch (err) {
      console.warn('[ag-status-observer] Error scraping DOM:', err);
    }
  }

  // Handle option selection from desktop floating widget
  if (ipc) {
    ipc.on('ag-widget-select-option', function(event, optionIndex) {
      try {
        var btns = window.__agOptionButtons;
        if (btns && btns[optionIndex]) {
          var targetEl = btns[optionIndex];
          var radioOrInp = targetEl.querySelector ? targetEl.querySelector('input[type="radio"], input[type="checkbox"]') : null;
          if (radioOrInp) {
            radioOrInp.click();
          } else {
            targetEl.click();
          }
          var subBtn = window.__agSubmitButton;
          if (subBtn) {
            setTimeout(function() {
              try {
                if (subBtn && typeof subBtn.click === 'function') {
                  subBtn.click();
                }
              } catch (_) {}
            }, 120);
          }
        }
      } catch (e) {
        console.warn('[ag-status-observer] Failed to click option:', e);
      }
    });
  }

  // Periodic polling + throttled DOM mutation observer (debounced 250ms to prevent layout thrashing)
  var scrapeTimer = null;
  function scheduleScrape() {
    if (scrapeTimer) return;
    scrapeTimer = setTimeout(function() {
      scrapeTimer = null;
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(function() {
          scrapeDom();
        });
      } else {
        scrapeDom();
      }
    }, 250);
  }

  setInterval(scheduleScrape, 2000);
  scheduleScrape();

  var observer = new MutationObserver(function() {
    scheduleScrape();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
  }
})();
`;
}

function getScraperExpression() {
  return `
    (() => {
      // 1. Detect Ask Question or Proceed modal / card
      let askInfo = null;
      let askFound = false;

      function extractCardData(cardEl) {
        const lines = (cardEl.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
        let qTitle = '';
        for (let l = 0; l < lines.length; l++) {
          const ln = lines[l];
          if (/^(Asking \\d+ question|Waiting for user input\\.\\.\\.|Waiting for user input|跳過|Skip|提交|Submit)$/i.test(ln)) {
            continue;
          }
          if (!qTitle) qTitle = ln;
          if (ln.indexOf('？') !== -1 || ln.indexOf('?') !== -1) {
            qTitle = ln;
            break;
          }
        }

        const opts = [];
        const allCardBtns = cardEl.querySelectorAll('button, [role="button"]');
        for (let b = 0; b < allCardBtns.length; b++) {
          const btn = allCardBtns[b];
          const bt = (btn.innerText || btn.textContent || '').trim();
          if (!bt || /^(Submit|送出|提交|確認送出|確定|Skip|略過|跳過|關閉|Close|X)$/i.test(bt)) {
            continue;
          }
          if (/^(一般|通用|常規|常规|外觀|外观|模型|自訂設定|自定义设置|瀏覽器|浏览器|帳號|账号|賬戶|账户|偏好設定|偏好设置|設定|设置|General|Appearance|Models|Account|Feedback|About)$/i.test(bt)) {
            continue;
          }
          const cleanText = bt.replace(/^\\s*\\d+[\\s\\.\\:\\、\\)]*/, '').trim() || bt;
          if (opts.indexOf(cleanText) === -1) {
            opts.push(cleanText);
          }
        }

        if (opts.length === 0) {
          const radioEls = cardEl.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"], label');
          for (let r = 0; r < radioEls.length; r++) {
            const rel = radioEls[r];
            const rt = (rel.innerText || rel.textContent || '').trim();
            if (!rt || /^(Submit|送出|提交|確認送出|確定|Skip|略過|跳過)$/i.test(rt)) continue;
            const cleanRt = rt.replace(/^\\s*\\d+[\\s\\.\\:\\、\\)]*/, '').trim() || rt;
            if (opts.indexOf(cleanRt) === -1) {
              opts.push(cleanRt);
            }
          }
        }

        if (opts.length === 0) {
          const allDescendants = cardEl.querySelectorAll('div, li, p');
          for (let d = 0; d < allDescendants.length; d++) {
            const dEl = allDescendants[d];
            if (dEl.children.length > 4) continue;
            const dt = (dEl.innerText || '').trim();
            const mNum = dt.match(/^(\\d+)[\\s\\.\\:\\、\\)]+(.+)/s);
            if (mNum && mNum[1] && mNum[2]) {
              const optText = mNum[2].trim();
              if (optText && opts.indexOf(optText) === -1) {
                opts.push(optText);
              }
            } else if (/^\\(Recommended\\)|^Other\\b/i.test(dt) && opts.indexOf(dt) === -1) {
              opts.push(dt);
            }
          }
        }

        if (opts.length === 0) {
          for (let pl = 0; pl < lines.length; pl++) {
            const lineText = lines[pl];
            if (/^(Asking|Waiting|跳過|Skip|提交|Submit|Close|關閉)/i.test(lineText)) continue;
            if (lineText === qTitle) continue;
            const m = lineText.match(/^(\\d+)[\\s\\.\\:\\、\\)]+(.+)/);
            if (m && m[2].trim()) {
              opts.push(m[2].trim());
            } else if (/^\\(Recommended\\)|^Other\\b/i.test(lineText)) {
              opts.push(lineText);
            }
          }
        }

        return {
          question: qTitle || '需要您的確認或決策',
          options: opts
        };
      }

      // 1.1 Strategy A: Find inline question card via action buttons
      const allButtons = document.querySelectorAll('button, [role="button"]');
      for (let bIdx = 0; bIdx < allButtons.length; bIdx++) {
        const btn = allButtons[bIdx];
        const btnText = (btn.innerText || btn.textContent || '').trim();
        if (/^(Submit|送出|提交|確認送出|確定)$/i.test(btnText) || /^提交\\b/i.test(btnText) || /^Submit\\b/i.test(btnText)) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            let curr = btn.parentElement;
            let matchedCard = null;
            for (let depth = 0; depth < 8 && curr && curr !== document.body && curr !== document.documentElement; depth++) {
              const attr = (curr.className || '') + ' ' + (curr.getAttribute('aria-label') || '') + ' ' + (curr.id || '');
              if (/settings|preferences|feedback|about|menubar|context-menu/i.test(attr)) {
                break;
              }
              const cText = curr.innerText || '';
              if (cText.indexOf('應用程式設定') !== -1 || cText.indexOf('应用程序设置') !== -1 || ((cText.indexOf('外觀') !== -1 || cText.indexOf('外观') !== -1) && (cText.indexOf('模型') !== -1 || cText.indexOf('通用') !== -1 || cText.indexOf('常规') !== -1))) {
                break;
              }
              if (cText.indexOf('？') !== -1 || cText.indexOf('?') !== -1 || /Waiting for user input|Asking \\d+ question|Recommended|Other/i.test(cText)) {
                matchedCard = curr;
                if (/form|rounded|card|border/i.test(curr.className || '') || cText.indexOf('Waiting for user input') !== -1) {
                  break;
                }
              }
              curr = curr.parentElement;
            }

            if (matchedCard) {
              const cardData = extractCardData(matchedCard);
              if (cardData.options.length >= 1) {
                askInfo = {
                  question: cardData.question,
                  options: cardData.options
                };
                askFound = true;
                break;
              }
            }
          }
        }
      }

      // 1.2 Strategy B: Find via "Waiting for user input" indicator
      if (!askFound) {
        const allTextNodes = document.querySelectorAll('div, span, p');
        for (let tni = 0; tni < allTextNodes.length; tni++) {
          const tn = allTextNodes[tni];
          const tnText = (tn.innerText || '').trim();
          if (tnText === 'Waiting for user input...' || tnText === 'Waiting for user input' || /^Asking \\d+ question/i.test(tnText)) {
            let pNode = tn.parentElement;
            while (pNode && pNode !== document.body) {
              const pBtns = pNode.querySelectorAll('button');
              if (pBtns.length >= 2) {
                const pData = extractCardData(pNode);
                if (pData.options.length >= 1) {
                  askInfo = {
                    question: pData.question,
                    options: pData.options
                  };
                  askFound = true;
                  break;
                }
              }
              pNode = pNode.parentElement;
            }
            if (askFound) break;
          }
        }
      }

      // 1.3 Strategy C: Check dialog elements
      if (!askFound) {
        const dialogs = document.querySelectorAll('[role="dialog"], [class*="dialog"], [class*="modal"]');
        for (let d = 0; d < dialogs.length; d++) {
          const dlg = dialogs[d];
          const dlgText = dlg.innerText || '';

          const dlgAttr = (dlg.className || '') + ' ' + (dlg.getAttribute('aria-label') || '') + ' ' + (dlg.id || '');
          if (/settings|preferences|feedback|about|menubar|context-menu/i.test(dlgAttr)) {
            continue;
          }
          const lines = dlgText.split('\\n').map(s => s.trim()).filter(Boolean);
          const qTitle = lines[0] || '';
          if (/^(設定|Settings|Preferences|设置|偏好設定|偏好设置|意見回饋|意见反馈|Feedback|關於|关于|鍵盤快捷鍵|键盘快捷键|Keyboard Shortcuts|自定义设置|自訂設定)$/i.test(qTitle)) {
            continue;
          }
          if (dlgText.indexOf('應用程式設定') !== -1 || dlgText.indexOf('应用程序设置') !== -1 || ((dlgText.indexOf('外觀') !== -1 || dlgText.indexOf('外观') !== -1) && (dlgText.indexOf('模型') !== -1 || dlgText.indexOf('通用') !== -1 || dlgText.indexOf('常规') !== -1))) {
            continue;
          }
          if (/General|Appearance|Models|Account|通用|常规|外观|模型|账号|账户/i.test(dlgText) && /Settings|Preferences|設定|设置|首选项|偏好設定|偏好设置/i.test(dlgText)) {
            continue;
          }

          let hasSubmitOrSkip = false;
          const allDlgBtns = dlg.querySelectorAll('button');
          for (let sbIdx = 0; sbIdx < allDlgBtns.length; sbIdx++) {
            const sbText = (allDlgBtns[sbIdx].innerText || '').trim();
            if (/^(Submit|送出|提交|確認送出|確定|Skip|略過|跳過)$/i.test(sbText)) {
              hasSubmitOrSkip = true;
              break;
            }
          }
          const optionInputs = dlg.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="option"], [data-option]');

          if (!hasSubmitOrSkip && optionInputs.length === 0) {
            continue;
          }

          const opts = [];
          for (let b = 0; b < allDlgBtns.length; b++) {
            const bt = (allDlgBtns[b].innerText || '').trim();
            if (bt && !/^(關閉|Close|X|Submit|送出|提交|確認送出|確定|Skip|略過|跳過)$/i.test(bt)) {
              if (!/^(一般|外觀|模型|自訂設定|瀏覽器|General|Appearance|Models|Account)$/i.test(bt)) {
                opts.push(bt);
              }
            }
          }
          if (opts.length >= 2 || (hasSubmitOrSkip && opts.length >= 1)) {
            askInfo = { question: qTitle || '需要您的確認或決策', options: opts };
            askFound = true;
            break;
          }
        }
      }

      // 1.4 Strategy D: Check Proceed / Approve banner
      if (!askFound) {
        const allBtns = document.querySelectorAll('button');
        for (let i = 0; i < allBtns.length; i++) {
          const bText = (allBtns[i].innerText || '').trim();
          if (/^(Proceed|Approve|同意執行|繼續執行)/i.test(bText)) {
            const rect = allBtns[i].getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              askInfo = {
                question: '任務執行計畫已就緒，等待您的批准',
                options: [bText, '檢視計畫詳情']
              };
              askFound = true;
              break;
            }
          }
        }
      }

      // 2. Scrape files changed & diff metrics from header
      let filesChangedCount = 0;
      let totalAdd = 0;
      let totalDel = 0;

      const fHeaders = document.querySelectorAll('.files-changed-header');
      for (let fh = 0; fh < fHeaders.length; fh++) {
        const fht = (fHeaders[fh].innerText || '').trim();
        const mf = fht.match(/(\d+)\s+file/i);
        if (mf) {
          const fc = parseInt(mf[1], 10);
          if (fc > filesChangedCount) filesChangedCount = fc;
        }
        const ma = fht.match(/\+(\d+)/);
        if (ma) {
          const fa = parseInt(ma[1], 10);
          if (fa > totalAdd) totalAdd = fa;
        }
        const md = fht.match(/-(\d+)/);
        if (md) {
          const fd = parseInt(md[1], 10);
          if (fd > totalDel) totalDel = fd;
        }
      }

      // 3. Scrape step action nodes across DOM
      const activities = [];
      const seenActKeys = {};
      const seenEdits = {};
      const seenReadFiles = {};
      let groupReadCount = 0;
      let cmdCount = 0;

      const allStepNodes = document.querySelectorAll(
        'div.flex.flex-row.items-center.gap-1, button[class*="tabular-nums"], div.truncate, ' +
        '[class*="step-row"], [class*="action-row"], div[class*="leading-relaxed"] div.truncate'
      );
      for (let sn = 0; sn < allStepNodes.length; sn++) {
        let raw = (allStepNodes[sn].innerText || '').trim().replace(/\s+/g, ' ');
        if (!raw) continue;
        raw = raw.replace(/\s*[>v]\s*$/, '').trim();

        // 3.1 Pattern: Edited <file> +X -Y
        const mEdit = raw.match(/^(?:Edited|Modified|修改)\s+(?:<>\s*)?(?:(?:js|ts|jsx|tsx|py|html|css|json|md|sh|bat)\s+)?([^\n+\-]+?)(?:\s+\+(\d+))?(?:\s+-(\d+))?$/i);
        if (mEdit) {
          const fName = mEdit[1].trim();
          const add = mEdit[2] ? parseInt(mEdit[2], 10) : 0;
          const del = mEdit[3] ? parseInt(mEdit[3], 10) : 0;
          const diffStr = (add > 0 || del > 0) ? ('+' + add + ' -' + del) : '';
          const eKey = 'edit:' + fName + (diffStr ? ':' + diffStr : '');
          if (!seenActKeys[eKey]) {
            seenActKeys[eKey] = true;
            seenEdits[fName] = true;
            activities.push({ type: 'edit', text: fName, diff: diffStr });
          }
          continue;
        }

        // 3.2 Pattern: Ran <N> commands
        const mCmdGroup = raw.match(/^(?:Ran|Run|Executed|執行中?|已執行)?\s*(\d+)\s*(?:commands?|個?(?:指令|命令))$/i);
        if (mCmdGroup) {
          const nCmds = parseInt(mCmdGroup[1], 10);
          const cgKey = 'cmd:group:' + nCmds;
          if (!seenActKeys[cgKey]) {
            seenActKeys[cgKey] = true;
            cmdCount += nCmds;
            activities.push({ type: 'cmd', text: nCmds + ' 個終端指令', diff: '' });
          }
          continue;
        }

        // 3.3 Pattern: Ran <cmd>
        const mCmd = raw.match(/^(?:Ran|Run|Executed|執行)\s+(.+)$/i);
        if (mCmd) {
          let cmd = mCmd[1].trim();
          cmd = cmd.replace(/[^\s"'\(\)]*[\\/]\.gemini[\\/]antigravity[\\/]brain[\\/][^\\/]+[\\/]scratch[\\/]/gi, 'scratch/');
          if (cmd.indexOf('node scratch/') === 0) {
            cmd = cmd.replace(/^node scratch\//, '');
          }
          const cmdKey = 'cmd:' + cmd;
          if (!seenActKeys[cmdKey]) {
            seenActKeys[cmdKey] = true;
            cmdCount++;
            activities.push({ type: 'cmd', text: cmd.length > 50 ? cmd.slice(0, 47) + '...' : cmd, diff: '' });
          }
          continue;
        }

        // 3.4 Pattern: Explored / Exploring / Analyzed / Analyzing / Read
        const mRead = raw.match(/^(?:Explored|Exploring|Analyzed|Analyzing|Read|Reading|Viewed|Viewing|讀取|已探索|探索|分析|已分析)\s+(?:(?:js|ts|jsx|tsx|py|html|css|json|md|sh|bat|file|files)\s+)?(.+)$/i);
        if (mRead) {
          const rTarget = mRead[1].trim().replace(/\s*[>v]\s*$/, '').trim();
          const mCount = rTarget.match(/^(\d+)\s+files?/i);
          const count = mCount ? parseInt(mCount[1], 10) : 1;
          const mFileOnly = rTarget.match(/^([a-zA-Z0-9_\-\.\/\\\~]+?\.[a-zA-Z0-9]+)/);
          const fBase = mFileOnly ? mFileOnly[1] : rTarget;

          if (count > 1) {
            groupReadCount = Math.max(groupReadCount, count);
          } else {
            seenReadFiles[fBase] = true;
          }

          const rKey = 'read:' + rTarget;
          if (!seenActKeys[rKey]) {
            seenActKeys[rKey] = true;
            activities.push({ type: 'read', text: rTarget, diff: '' });
          }
          continue;
        }
      }

      // Check terminal font-mono command headers
      const termSpans = document.querySelectorAll('span.font-mono, div.font-mono');
      for (let ts = 0; ts < termSpans.length; ts++) {
        const tText = (termSpans[ts].innerText || '').trim();
        if (tText.indexOf('node ') === 0 || tText.indexOf('npm ') === 0 || tText.indexOf('git ') === 0) {
          const tKey = 'cmd:' + tText;
          if (!seenActKeys[tKey]) {
            seenActKeys[tKey] = true;
            const cClean = tText.replace(/[^\s"'\(\)]*[\\/]\.gemini[\\/]antigravity[\\/]brain[\\/][^\\/]+[\\/]scratch[\\/]/gi, 'scratch/');
            cmdCount++;
            activities.push({ type: 'cmd', text: cClean.length > 50 ? cClean.slice(0, 47) + '...' : cClean, diff: '' });
          }
        }
      }

      const readCount = Math.max(groupReadCount + Object.keys(seenReadFiles).length, groupReadCount, Object.keys(seenReadFiles).length, activities.filter(a => a.type === 'read').length);
      const editCount = Math.max(filesChangedCount, Object.keys(seenEdits).length);

      // 4. Detect thinking / running / working state with live second timer
      let hasActiveWorkingText = false;
      let hasThinking = false;
      const allCheckNodes = document.querySelectorAll('button, div[class*="step"], span, p');
      for (let ci = 0; ci < allCheckNodes.length; ci++) {
        const cTxt = (allCheckNodes[ci].innerText || '').trim();
        if (/^Working\.{0,3}$/i.test(cTxt) || /^處理中\.{0,3}$/i.test(cTxt) || /^正在生成\.{0,3}$/i.test(cTxt) || /^Generating\.{0,3}$/i.test(cTxt)) {
          const cRect = allCheckNodes[ci].getBoundingClientRect();
          if (cRect.width > 0 && cRect.height > 0) {
            hasActiveWorkingText = true;
            break;
          }
        }
        if (/^Thinking\.{0,3}$/i.test(cTxt) || /^思考中\.{0,3}$/i.test(cTxt)) {
          const tRect = allCheckNodes[ci].getBoundingClientRect();
          if (tRect.width > 0 && tRect.height > 0) {
            hasThinking = true;
            hasActiveWorkingText = true;
            break;
          }
        }
      }

      let hasStopButton = false;
      const candidateStopButtons = document.querySelectorAll(
        'button[aria-label*="Stop" i], button[title*="Stop" i], ' +
        'button[aria-label*="停止"], button[title*="停止"], ' +
        'button[aria-label*="中斷"], button[title*="中斷"]'
      );
      for (let sbi = 0; sbi < candidateStopButtons.length; sbi++) {
        const sBtn = candidateStopButtons[sbi];
        const sRect = sBtn.getBoundingClientRect();
        if (sRect.width > 0 && sRect.height > 0) {
          const sLabel = (sBtn.getAttribute('aria-label') || sBtn.getAttribute('title') || sBtn.innerText || '').trim();
          if (/^(Stop(\s+(generating|response|agent|execution|run))?|停止(生成|回應|執行)?|中斷)$/i.test(sLabel) ||
              /^(Stop generating|停止生成|停止回應)/i.test(sLabel)) {
            hasStopButton = true;
            break;
          }
        }
      }

      let hasChatSpinner = false;
      const spinners = document.querySelectorAll('.animate-spin, svg.animate-spin, [class*="animate-spin"]');
      for (let spi = 0; spi < spinners.length; spi++) {
        const sp = spinners[spi];
        const spRect = sp.getBoundingClientRect();
        if (spRect.width > 0 && spRect.height > 0) {
          const insideChat = sp.closest('[class*="chat"], [class*="message"], [class*="step"], [class*="conversation"], [class*="timeline"]');
          if (insideChat) {
            const compStyle = window.getComputedStyle ? window.getComputedStyle(sp) : null;
            if (!compStyle || (compStyle.display !== 'none' && compStyle.visibility !== 'hidden' && compStyle.opacity !== '0')) {
              hasChatSpinner = true;
              break;
            }
          }
        }
      }

      const isWorking = hasStopButton || hasActiveWorkingText || hasChatSpinner;

      if (isWorking) {
        if (!window.__ag_work_start_time) {
          window.__ag_work_start_time = Date.now();
        }
      } else {
        window.__ag_work_start_time = null;
      }

      const elapsedSec = window.__ag_work_start_time ? Math.max(1, Math.floor((Date.now() - window.__ag_work_start_time) / 1000)) : 0;

      // 5. Scrape latest AI Agent response text
      let responseInfo = null;
      const aiResponseEls = document.querySelectorAll('div.leading-relaxed.select-text');
      if (aiResponseEls.length > 0) {
        const lastAiEl = aiResponseEls[aiResponseEls.length - 1];
        const rawAiText = (lastAiEl.innerText || '').trim();
        if (rawAiText) {
          const lines = rawAiText.split('\\n').map(l => l.trim()).filter(Boolean);
          let snippet = '';
          for (let li = 0; li < lines.length; li++) {
            if (lines[li].indexOf('#') !== 0 && lines[li].indexOf('---') !== 0) {
              snippet = lines[li];
              break;
            }
          }
          if (!snippet && lines.length > 0) snippet = lines[0];
          if (snippet.length > 150) snippet = snippet.slice(0, 147) + '...';

          responseInfo = {
            snippet: snippet,
            full: rawAiText.slice(0, 1200)
          };
        }
      }

      // Compute status with live real-time ticking
      let status = 'idle';
      let statusText = '待命中';
      if (askFound) {
        status = 'ask';
        statusText = '等待使用者決策';
        responseInfo = null;
      } else if (isWorking) {
        const lastAct = activities.length > 0 ? activities[activities.length - 1] : null;
        if (hasThinking) {
          status = 'thinking';
          statusText = '思考中 (' + elapsedSec + 's)...';
        } else if (lastAct && lastAct.type === 'read') {
          status = 'running';
          let rName = lastAct.text.replace(/^[^\w\.\-\/]+/, '');
          if (rName.length > 22) rName = rName.slice(0, 19) + '...';
          statusText = '分析: ' + rName + ' (' + elapsedSec + 's)...';
        } else if (lastAct && lastAct.type === 'cmd') {
          status = 'running';
          let cName = lastAct.text;
          if (cName.length > 22) cName = cName.slice(0, 19) + '...';
          statusText = '執行: ' + cName + ' (' + elapsedSec + 's)...';
        } else if (lastAct && lastAct.type === 'edit') {
          status = 'running';
          let eName = lastAct.text;
          if (eName.length > 22) eName = eName.slice(0, 19) + '...';
          statusText = '修改: ' + eName + ' (' + elapsedSec + 's)...';
        } else {
          status = 'running';
          statusText = '執行中 (' + elapsedSec + 's)...';
        }
      } else if (responseInfo) {
        status = 'completed';
        statusText = '任務已完成';
      }

      return {
        status,
        statusText,
        readCount,
        editCount,
        addLines: totalAdd,
        delLines: totalDel,
        cmdCount,
        ask: askInfo,
        activities: activities.slice(-100),
        response: responseInfo
      };
    })()
  `;
}

function getOptionClickExpression(optionIndex) {
  return `
    (() => {
      const idx = ${Number(optionIndex)};
      try {
        const btns = window.__agOptionButtons;
        if (btns && btns[idx]) {
          const targetEl = btns[idx];
          const radioOrInp = targetEl.querySelector ? targetEl.querySelector('input[type="radio"], input[type="checkbox"]') : null;
          if (radioOrInp) {
            radioOrInp.click();
          } else {
            targetEl.click();
          }
          const subBtn = window.__agSubmitButton;
          if (subBtn) {
            setTimeout(() => {
              try {
                if (subBtn && typeof subBtn.click === 'function') {
                  subBtn.click();
                }
              } catch (_) {}
            }, 120);
          }
          return true;
        }
      } catch (_) {}

      const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
      let submitBtn = null;
      for (let i = 0; i < allBtns.length; i++) {
        const t = (allBtns[i].innerText || '').trim();
        if (/^(Submit|送出|提交|確認送出|確定)$/i.test(t) || /^提交\\b/i.test(t) || /^Submit\\b/i.test(t)) {
          submitBtn = allBtns[i];
          break;
        }
      }
      if (submitBtn) {
        let parentCard = submitBtn.parentElement;
        for (let d = 0; d < 8 && parentCard && parentCard !== document.body; d++) {
          const cBtns = Array.from(parentCard.querySelectorAll('button, [role="button"], [role="radio"], label')).filter(b => {
            const bt = (b.innerText || '').trim();
            return bt && !/^(Submit|送出|提交|確認送出|確定|Skip|略過|跳過|關閉|Close|X)$/i.test(bt);
          });
          if (cBtns.length >= 1 && cBtns[idx]) {
            cBtns[idx].click();
            setTimeout(() => {
              try { submitBtn.click(); } catch (_) {}
            }, 120);
            return true;
          }
          parentCard = parentCard.parentElement;
        }
      }

      const dialogs = document.querySelectorAll('[role="dialog"], [class*="dialog"], [class*="modal"]');
      for (let d = 0; d < dialogs.length; d++) {
        const dlg = dialogs[d];
        const btns = Array.from(dlg.querySelectorAll('button')).filter(b => {
          const t = (b.innerText || '').trim();
          return t && !/^(關閉|Close|X)$/i.test(t);
        });
        if (btns.length >= 2 && btns[idx]) {
          btns[idx].click();
          return true;
        }
      }

      for (let i = 0; i < allBtns.length; i++) {
        const bText = (allBtns[i].innerText || '').trim();
        if (/^(Proceed|Approve|同意執行|繼續執行)/i.test(bText)) {
          if (idx === 0) {
            allBtns[i].click();
            return true;
          }
        }
      }
      return false;
    })()
  `;
}

module.exports = {
  parseStepText,
  extractMetrics,
  deduceAgentStatus,
  getObserverScript,
  getScraperExpression,
  getOptionClickExpression,
};
