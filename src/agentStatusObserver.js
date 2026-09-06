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
  const parts = cleaned.includes('|')
    ? cleaned.split('|').map(p => p.trim())
    : cleaned.split('\n').map(p => p.trim()).filter(Boolean);

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
      result.cmdCount++;
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

      // 2. Scrape steps & metrics
      var stepTexts = [];
      var elements = document.querySelectorAll('.truncate, .relative, [class*="flex-row"], [class*="step"]');
      for (var e = 0; e < elements.length; e++) {
        var el = elements[e];
        var txt = (el.innerText || '').trim();
        if ((txt.startsWith('Edited\\n') || txt.startsWith('Explored\\n') || txt.startsWith('Ran\\n')) && el.children.length <= 4) {
          stepTexts.push(txt.split('\\n').join(' | '));
        }
      }

      // Deduplicate consecutive identical steps
      var uniqueSteps = [];
      for (var s = 0; s < stepTexts.length; s++) {
        if (uniqueSteps.indexOf(stepTexts[s]) === -1) {
          uniqueSteps.push(stepTexts[s]);
        }
      }

      // 3. Detect thinking / working state
      var isWorking = false;
      var thinkingText = '';
      var stopButtons = document.querySelectorAll('button');
      for (var sb = 0; sb < stopButtons.length; sb++) {
        var st = (stopButtons[sb].innerText || '').trim();
        if (/^(Stop|Cancel|停止|中斷)$/i.test(st)) {
          isWorking = true;
          break;
        }
      }

      // Find thought/worked timer buttons
      var timerButtons = document.querySelectorAll('button');
      for (var tb = 0; tb < timerButtons.length; tb++) {
        var tt = (timerButtons[tb].innerText || '').trim();
        if (/^(Thought for|Worked for|Thinking|思考中|運作中)/i.test(tt)) {
          thinkingText = tt;
          // If this button is near the bottom and contains an active spinner, it's working
          if (timerButtons[tb].querySelector('svg[class*="animate"], [class*="spinner"]')) {
            isWorking = true;
          }
        }
      }

      // Compute status
      var status = 'idle';
      var statusText = '待命中';
      if (askFound) {
        status = 'ask';
        statusText = '等待使用者決策';
      } else if (isWorking) {
        status = 'running';
        statusText = thinkingText || 'Agent 運作中...';
      }

      // Parse activity metrics
      var readCount = 0;
      var editCount = 0;
      var addLines = 0;
      var delLines = 0;
      var cmdCount = 0;
      var activities = [];
      var seenEdits = {};
      var seenReads = {};

      for (var u = 0; u < uniqueSteps.length; u++) {
        var parts = uniqueSteps[u].split('|').map(function(p) { return p.trim(); });
        if (parts.length === 0) continue;
        var verb = parts[0];

        if (/^(Edited|Modified|修改)/i.test(verb)) {
          var target = parts[1] || 'File';
          var aL = 0;
          var dL = 0;
          for (var pIdx = 2; pIdx < parts.length; pIdx++) {
            var am = parts[pIdx].match(/^\\+(\\d+)/);
            if (am) aL += parseInt(am[1], 10);
            var dm = parts[pIdx].match(/^-(\\d+)/);
            if (dm) dL += parseInt(dm[1], 10);
          }
          seenEdits[target] = true;
          addLines += aL;
          delLines += dL;
          activities.push({
            type: 'edit',
            text: target,
            diff: (aL > 0 || dL > 0) ? ('+' + aL + ' -' + dL) : ''
          });
        } else if (/^(Explored|Read|讀取)/i.test(verb)) {
          var rTarget = parts[1] || 'Files';
          seenReads[rTarget] = true;
          activities.push({ type: 'read', text: rTarget, diff: '' });
        } else if (/^(Ran|Executed|執行)/i.test(verb)) {
          var cTarget = parts[1] || 'Command';
          cmdCount++;
          activities.push({
            type: 'cmd',
            text: cTarget.length > 50 ? cTarget.slice(0, 47) + '...' : cTarget,
            diff: ''
          });
        }
      }

      readCount = Object.keys(seenReads).length;
      editCount = Object.keys(seenEdits).length;

      var payload = {
        status: status,
        statusText: statusText,
        readCount: readCount,
        editCount: editCount,
        addLines: addLines,
        delLines: delLines,
        cmdCount: cmdCount,
        ask: askInfo,
        activities: activities.slice(-15)
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
        activities: activities.slice(-10)
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
