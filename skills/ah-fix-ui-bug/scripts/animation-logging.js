/**
 * Animation Logging
 *
 * When a Web Animations API animation lands at the wrong position, the bug is
 * usually in the keyframe values being calculated from stale layout data --
 * getBoundingClientRect() was called before a pending layout flush, so the
 * "from" or "to" transform is based on outdated coordinates. But these values
 * are ephemeral: once the animation starts, you can't inspect what was passed.
 *
 * This script monkey-patches HTMLElement.prototype.animate to intercept every
 * animation call and log the keyframes alongside the element's actual position
 * at call time. Comparing the logged transform values with the actual rect
 * reveals whether the animation was given correct coordinates.
 *
 * NOTE: Assumes object-of-arrays keyframe format ({transform: ['...', '...']}).
 * The Web Animations API accepts two formats -- adjust the check if the code
 * uses array-of-objects format ([{transform: '...'}, {transform: '...'}]).
 *
 * @usage chrome-devtools evaluate_script "<content>"
 * @returns {string} Confirmation message.
 */
() => {
  const orig = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = function(keyframes, options) {
    if (keyframes?.transform?.[1]?.includes('translate')) {
      const r = this.getBoundingClientRect();
      console.log('[ANIM]', {
        from: {left: this.style.left, top: this.style.top},
        actual: {left: r.left, top: r.top},
        transform: keyframes.transform[1],
        duration: options?.duration
      });
    }
    return orig.call(this, keyframes, options);
  };
  return 'animate() patched';
}
