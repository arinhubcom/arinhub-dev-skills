/**
 * Persistent Diagnostic Overlay
 *
 * Some UI bugs can only be reproduced with real user interaction -- libraries
 * like dnd-kit check event.isPrimary on PointerEvents, which synthetic CDP
 * events may not set. In these cases, automated chrome-devtools click commands
 * won't trigger the bug. This script bridges that gap: it installs a visible
 * on-screen overlay that shows position changes and attribute mutations in
 * real-time, so the developer can interact manually in the browser while the
 * diagnostic data streams to the overlay.
 *
 * The overlay uses pointer-events:none so it doesn't interfere with the
 * interactions being debugged. The log is capped at 20 entries to prevent
 * memory issues during continuous monitoring. The rAF loop provides frame-level
 * position tracking while the MutationObserver catches attribute changes
 * synchronously -- together they cover both gradual drifts and instant jumps.
 *
 * @customize Change '.target-element' to match the element(s) being debugged.
 * @usage chrome-devtools evaluate_script "<content>"
 * @returns {string} Confirmation message.
 */
() => {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.85);color:#0f0;font:11px monospace;padding:8px;z-index:99999;max-height:200px;overflow-y:auto;pointer-events:none';
  document.body.appendChild(overlay);
  const log = [];
  function addLog(msg) {
    log.push(performance.now().toFixed(0) + 'ms: ' + msg);
    if (log.length > 20) log.shift();
    overlay.textContent = log.join('\n');
  }

  // Position monitor
  const els = document.querySelectorAll('.target-element');
  const prev = new Map();
  els.forEach(el => {
    const r = el.getBoundingClientRect();
    prev.set(el, {t: Math.round(r.top), l: Math.round(r.left)});
  });
  function check() {
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      const curr = {t: Math.round(r.top), l: Math.round(r.left)};
      const p = prev.get(el);
      if (curr.t !== p.t || curr.l !== p.l) {
        addLog('MOVED ' + (el.className?.substring(0, 30) || el.tagName) +
          ' from (' + p.l + ',' + p.t + ') to (' + curr.l + ',' + curr.t + ')');
      }
      prev.set(el, curr);
    });
    requestAnimationFrame(check);
  }
  requestAnimationFrame(check);

  // Mutation monitor
  const target = document.querySelector('.target-element');
  if (target) {
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        addLog('ATTR ' + m.attributeName + ' changed on ' + m.target.tagName);
      }
    });
    mo.observe(target, {attributes: true, attributeOldValue: true});
  }

  addLog('Diagnostic overlay active - interact manually');
  return 'Overlay installed';
}
