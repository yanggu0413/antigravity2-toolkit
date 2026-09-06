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

    if (/^(Explored|Read|Viewed|讀取)/i.test(verb)) {
      const target = parts[1] || 'Files';
      return {
        type: 'read',
        text: target,
        diff: '',
        addLines: 0,
        delLines: 0,
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
      };
    }
  }

  // Single-line DOM format (e.g. "Edited foo.js +10 -2", "Ran git status", "Explored 3 files")
  const mEdit = cleaned.match(/^(?:Edited|Modified|修改)\s+(?:<>\s*)?([^\n+\-]+?)(?:\s+\+(\d+))?(?:\s+-(\d+))?$/i);
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

  const mCmdGroup = cleaned.match(/^(?:Ran|Run|Executed|執行中?)\s+(\d+)\s+commands?$/i) || cleaned.match(/^(\d+)\s+commands?$/i);
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
    if (cmd.startsWith('node scratch/')) {
      cmd = cmd.replace(/^node scratch\//, '');
    }
    cmd = cmd.replace(/C:\\Users\\Yanggu\\\.gemini\\antigravity\\brain\\[^\\]+\\scratch\\/g, 'scratch/');
    return {
      type: 'cmd',
      text: cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd,
      diff: '',
      addLines: 0,
      delLines: 0,
      count: 1,
    };
  }

  const mRead = cleaned.match(/^(?:Explored|Read|Viewed|讀取)\s+(.+)$/i);
  if (mRead) {
    return {
      type: 'read',
      text: mRead[1].trim(),
      diff: '',
      addLines: 0,
      delLines: 0,
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
  const seenReads = new Set();

  for (const raw of stepTexts) {
    const parsed = parseStepText(raw);
    if (!parsed) continue;

    result.activities.push({
      type: parsed.type,
      text: parsed.text,
      diff: parsed.diff,
    });

    if (parsed.type === 'edit') {
      seenEdits.add(parsed.text);
      result.addLines += parsed.addLines;
      result.delLines += parsed.delLines;
    } else if (parsed.type === 'read') {
      seenReads.add(parsed.text);
    } else if (parsed.type === 'cmd') {
      result.cmdCount += (parsed.count || 1);
    }
  }

  result.editCount = seenEdits.size || (result.addLines > 0 ? 1 : 0);
  result.readCount = seenReads.size;

  return result;
}

/**
 * Deduces agent state based on UI indicators.
 * @param {object} params
 * @returns {{ status: string, statusText: string }}
 */
function deduceAgentStatus({ hasAsk, isWorking, thinkingText, lastActionText }) {
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
      var dialogs = document.querySelectorAll('[role="dialog"], [class*="dialog"], [class*="modal"]');
      var askFound = false;

      // Check dialog elements
      for (var d = 0; d < dialogs.length; d++) {
        var dlg = dialogs[d];
        var dlgText = dlg.innerText || '';
        var btns = dlg.querySelectorAll('button');
        if (btns.length >= 2) {
          var opts = [];
          var btnList = [];
          for (var b = 0; b < btns.length; b++) {
            var bt = btns[b].innerText.trim();
            if (bt && !/^(關閉|Close|X)$/i.test(bt)) {
              opts.push(bt);
              btnList.push(btns[b]);
            }
          }
          if (opts.length >= 2) {
            var lines = dlgText.split('\\n').map(function(s) { return s.trim(); }).filter(Boolean);
            var qTitle = lines[0] || '需要您的確認或決策';
            askInfo = { question: qTitle, options: opts };
            optionButtons = btnList;
            askFound = true;
            break;
          }
        }
      }

      // If no dialog found, check for Proceed / Approve banner
      if (!askFound) {
        var allBtns = document.querySelectorAll('button');
        for (var i = 0; i < allBtns.length; i++) {
          var bText = (allBtns[i].innerText || '').trim();
          if (/^(Proceed|Approve|同意執行|繼續執行)/i.test(bText)) {
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

      window.__agOptionButtons = optionButtons;

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
      var seenRaw = {};
      var seenEdits = {};
      var seenReads = {};
      var cmdCount = 0;

      var allStepNodes = document.querySelectorAll('div.flex.flex-row.items-center.gap-1, button[class*="tabular-nums"], div.truncate');
      for (var sn = 0; sn < allStepNodes.length; sn++) {
        var raw = (allStepNodes[sn].innerText || '').trim().replace(/\s+/g, ' ');
        if (!raw || seenRaw[raw]) continue;

        // Pattern: Edited <file> +X -Y
        var mEdit = raw.match(/^(?:Edited|Modified|修改)\s+(?:<>\s*)?([^\n+\-]+?)(?:\s+\+(\d+))?(?:\s+-(\d+))?$/i);
        if (mEdit) {
          seenRaw[raw] = true;
          var fName = mEdit[1].trim();
          seenEdits[fName] = true;
          var add = mEdit[2] ? parseInt(mEdit[2], 10) : 0;
          var del = mEdit[3] ? parseInt(mEdit[3], 10) : 0;
          var diffStr = (add > 0 || del > 0) ? ('+' + add + ' -' + del) : '';
          activities.push({ type: 'edit', text: fName, diff: diffStr });
          continue;
        }

        // Pattern: Ran <N> commands or <N> commands
        var mCmdGroup = raw.match(/^(?:Ran|Run|Executed|執行中?)\s+(\d+)\s+commands?$/i);
        if (!mCmdGroup) {
          mCmdGroup = raw.match(/^(\d+)\s+commands?$/i);
        }
        if (mCmdGroup) {
          seenRaw[raw] = true;
          var nCmds = parseInt(mCmdGroup[1], 10);
          cmdCount += nCmds;
          activities.push({ type: 'cmd', text: nCmds + ' 個終端指令', diff: '' });
          continue;
        }

        // Pattern: Ran <cmd>
        var mCmd = raw.match(/^(?:Ran|Run|Executed|執行)\s+(.+)$/i);
        if (mCmd) {
          seenRaw[raw] = true;
          var cmd = mCmd[1].trim();
          if (cmd.indexOf('node scratch/') === 0) {
            cmd = cmd.replace(/^node scratch\//, '');
          }
          cmd = cmd.replace(/C:\\Users\\Yanggu\\\.gemini\\antigravity\\brain\\[^\\]+\\scratch\\/g, 'scratch/');
          cmdCount++;
          activities.push({ type: 'cmd', text: cmd.length > 50 ? cmd.slice(0, 47) + '...' : cmd, diff: '' });
          continue;
        }

        // Pattern: Explored <N> files
        var mRead = raw.match(/^(?:Explored|Read|Viewed|讀取)\s+(.+)$/i);
        if (mRead) {
          seenRaw[raw] = true;
          var rText = mRead[1].trim();
          seenReads[rText] = true;
          activities.push({ type: 'read', text: rText, diff: '' });
          continue;
        }
      }

      // Check terminal font-mono command headers to never miss commands
      var termSpans = document.querySelectorAll('span.font-mono, div.font-mono');
      for (var ts = 0; ts < termSpans.length; ts++) {
        var tText = (termSpans[ts].innerText || '').trim();
        if (tText.indexOf('node ') === 0 || tText.indexOf('npm ') === 0 || tText.indexOf('git ') === 0) {
          if (!seenRaw[tText] && !seenRaw['Ran ' + tText] && !seenRaw['Run ' + tText]) {
            seenRaw[tText] = true;
            var cClean = tText.replace(/C:\\Users\\Yanggu\\\.gemini\\antigravity\\brain\\[^\\]+\\scratch\\/g, 'scratch/');
            cmdCount++;
            activities.push({ type: 'cmd', text: cClean.length > 50 ? cClean.slice(0, 47) + '...' : cClean, diff: '' });
          }
        }
      }

      var readCount = Math.max(Object.keys(seenReads).length, activities.filter(function(a) { return a.type === 'read'; }).length);
      var editCount = Math.max(filesChangedCount, Object.keys(seenEdits).length);

      // 4. Detect thinking / working state with live second timer
      var isWorking = false;
      var stopButtons = document.querySelectorAll('button[aria-label*="Cancel"], button[aria-label*="取消"], button[aria-label*="Stop"], button[aria-label*="停止"], button[aria-label*="Stop execution"]');
      if (stopButtons.length > 0) {
        isWorking = true;
      }

      var workingTextNode = false;
      var allNodes = document.querySelectorAll('*');
      for (var an = 0; an < allNodes.length; an++) {
        if ((allNodes[an].innerText || '').trim() === 'Working.') {
          workingTextNode = true;
          break;
        }
      }
      var isSpinnerActive = document.querySelectorAll('svg[class*="animate"], [class*="spinner"]').length > 0;

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
      } else if (isWorking) {
        if (workingTextNode || isSpinnerActive) {
          status = 'running';
          statusText = '執行中 (' + elapsedSec + 's)...';
        } else {
          status = 'thinking';
          statusText = '思考中 (' + elapsedSec + 's)...';
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
          btns[optionIndex].click();
        }
      } catch (e) {
        console.warn('[ag-status-observer] Failed to click option:', e);
      }
    });
  }

  // Periodic polling + DOM mutation observer
  setInterval(scrapeDom, 800);
  scrapeDom();

  var observer = new MutationObserver(function() {
    scrapeDom();
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

      const dialogs = document.querySelectorAll('[role="dialog"], [class*="dialog"], [class*="modal"]');
      for (let d = 0; d < dialogs.length; d++) {
        const dlg = dialogs[d];
        const dlgText = dlg.innerText || '';
        const btns = dlg.querySelectorAll('button');
        if (btns.length >= 2) {
          const opts = [];
          for (let b = 0; b < btns.length; b++) {
            const bt = (btns[b].innerText || '').trim();
            if (bt && !/^(關閉|Close|X)$/i.test(bt)) {
              opts.push(bt);
            }
          }
          if (opts.length >= 2) {
            const lines = dlgText.split('\\n').map(s => s.trim()).filter(Boolean);
            askInfo = { question: lines[0] || '需要您的確認或決策', options: opts };
            askFound = true;
            break;
          }
        }
      }

      if (!askFound) {
        const allBtns = document.querySelectorAll('button');
        for (let i = 0; i < allBtns.length; i++) {
          const bText = (allBtns[i].innerText || '').trim();
          if (/^(Proceed|Approve|同意執行|繼續執行)/i.test(bText)) {
            askInfo = {
              question: '任務執行計畫已就緒，等待您的批准',
              options: [bText, '檢視計畫詳情']
            };
            askFound = true;
            break;
          }
        }
      }

      // 2. Scrape steps & metrics
      const stepTexts = [];
      const elements = document.querySelectorAll('.truncate, .relative, [class*="flex-row"], [class*="step"]');
      for (let e = 0; e < elements.length; e++) {
        const el = elements[e];
        const txt = (el.innerText || '').trim();
        if ((txt.startsWith('Edited\\n') || txt.startsWith('Explored\\n') || txt.startsWith('Ran\\n')) && el.children.length <= 4) {
          stepTexts.push(txt.split('\\n').join(' | '));
        }
      }

      const uniqueSteps = Array.from(new Set(stepTexts));

      // 3. Detect thinking / working state
      let isWorking = false;
      let thinkingText = '';
      const stopButtons = document.querySelectorAll('button');
      for (let sb = 0; sb < stopButtons.length; sb++) {
        const st = (stopButtons[sb].innerText || '').trim();
        if (/^(Stop|Cancel|停止|中斷)$/i.test(st)) {
          isWorking = true;
          break;
        }
      }

      const timerButtons = document.querySelectorAll('button');
      for (let tb = 0; tb < timerButtons.length; tb++) {
        const tt = (timerButtons[tb].innerText || '').trim();
        if (/^(Thought for|Worked for|Thinking|思考中|運作中)/i.test(tt)) {
          thinkingText = tt;
          if (timerButtons[tb].querySelector('svg[class*="animate"], [class*="spinner"]')) {
            isWorking = true;
          }
        }
      }

      let status = 'idle';
      let statusText = '待命中';
      if (askFound) {
        status = 'ask';
        statusText = '等待使用者決策';
      } else if (isWorking) {
        status = 'running';
        statusText = thinkingText || 'Agent 運作中...';
      }

      // Parse activity metrics
      let readCount = 0;
      let editCount = 0;
      let addLines = 0;
      let delLines = 0;
      let cmdCount = 0;
      const activities = [];
      const seenEdits = new Set();
      const seenReads = new Set();

      for (let u = 0; u < uniqueSteps.length; u++) {
        const parts = uniqueSteps[u].split('|').map(p => p.trim());
        if (parts.length === 0) continue;
        const verb = parts[0];

        if (/^(Edited|Modified|修改)/i.test(verb)) {
          const target = parts[1] || 'File';
          let aL = 0;
          let dL = 0;
          for (let pIdx = 2; pIdx < parts.length; pIdx++) {
            const am = parts[pIdx].match(/^\\+(\\d+)/);
            if (am) aL += parseInt(am[1], 10);
            const dm = parts[pIdx].match(/^-(\\d+)/);
            if (dm) dL += parseInt(dm[1], 10);
          }
          seenEdits.add(target);
          addLines += aL;
          delLines += dL;
          activities.push({
            type: 'edit',
            text: target,
            diff: (aL > 0 || dL > 0) ? ('+' + aL + ' -' + dL) : ''
          });
        } else if (/^(Explored|Read|讀取)/i.test(verb)) {
          const rTarget = parts[1] || 'Files';
          seenReads.add(rTarget);
          activities.push({ type: 'read', text: rTarget, diff: '' });
        } else if (/^(Ran|Executed|執行)/i.test(verb)) {
          const cTarget = parts[1] || 'Command';
          cmdCount++;
          activities.push({
            type: 'cmd',
            text: cTarget.length > 50 ? cTarget.slice(0, 47) + '...' : cTarget,
            diff: ''
          });
        }
      }

      readCount = seenReads.size;
      editCount = seenEdits.size;

      return {
        status,
        statusText,
        readCount,
        editCount,
        addLines,
        delLines,
        cmdCount,
        ask: askInfo,
        activities: activities.slice(-100)
      };
    })()
  `;
}

function getOptionClickExpression(optionIndex) {
  return `
    (() => {
      const idx = ${Number(optionIndex)};
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

      const allBtns = document.querySelectorAll('button');
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
