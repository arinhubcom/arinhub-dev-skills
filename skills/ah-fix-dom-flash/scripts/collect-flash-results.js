/**
 * Collect Flash Results
 *
 * Retrieves the detections recorded by flash-detector.js and stops both the
 * MutationObserver and the rAF loop to prevent further data collection.
 *
 * Always run this AFTER reproducing the interaction that triggers the flash.
 * The script returns up to 20 detections to avoid overwhelming the output;
 * if the bug produces many events (e.g., continuous animation), increase the
 * slice limit or filter by type.
 *
 * @usage chrome-devtools evaluate_script "<content>"
 * @requires flash-detector.js must be injected first.
 * @returns {Object} Detection count and up to 20 detailed entries.
 */
() => {
  const results = window.__flashDetected || [];
  window.__stopFlashDetector?.();
  return {
    count: results.length,
    detections: results.slice(0, 20),
  };
}
