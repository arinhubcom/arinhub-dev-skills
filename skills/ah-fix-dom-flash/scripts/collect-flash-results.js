/**
 * Collect Flash Results v2
 *
 * Retrieves detections from flash-detector.js, stops the detector, and
 * returns results separated into high-confidence flashes and lower-confidence
 * noise. This separation makes it easy to focus on actual flash bugs
 * without wading through normal DOM activity.
 *
 * - `flashes`: position-lost, flash, transform-lost -- these are the bugs
 * - `noise`: added, attr-change -- may be normal DOM activity, investigate
 *   only if flashes array is empty
 *
 * @usage chrome-devtools evaluate_script "<content>"
 * @requires flash-detector.js must be injected first.
 * @returns {Object} Separated flash vs noise detections with summary.
 */
() => {
  const results = window.__flashDetected || [];
  window.__stopFlashDetector?.();

  const summary = {};
  for (const d of results) {
    summary[d.type] = (summary[d.type] || 0) + 1;
  }

  const flashTypes = new Set(['flash', 'position-lost', 'transform-lost']);
  const flashes = results.filter((d) => flashTypes.has(d.type));
  const noise = results.filter((d) => !flashTypes.has(d.type));

  return {
    total: results.length,
    flashCount: flashes.length,
    noiseCount: noise.length,
    summary,
    flashes: flashes.slice(0, 15),
    noise: noise.slice(0, 15),
  };
}
