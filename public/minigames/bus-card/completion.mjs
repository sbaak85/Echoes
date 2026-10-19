export const SUCCESS_MESSAGE = '電流已重新導通，重新更新負載';
export const SUCCESS_TIMING = Object.freeze({ fadeInMs: 500, holdMs: 1000, fadeOutMs: 500, closeAfterMs: 2200 });

// One clock drives the message and the host notification, so closing never cuts off the fade.
export function createCompletionSequence({ present, finish }) {
  let startedAt = null, solution = null;
  return {
    get active() { return startedAt !== null; },
    start(now, slots) {
      if (startedAt !== null) return false;
      startedAt = now;
      solution = [...slots];
      present({ phase: 'fade-in', opacity: 0 });
      return true;
    },
    tick(now) {
      if (startedAt === null) return;
      const elapsed = Math.max(0, now - startedAt);
      const { fadeInMs, holdMs, fadeOutMs, closeAfterMs } = SUCCESS_TIMING;
      const fadeOutAt = fadeInMs + holdMs, hiddenAt = fadeOutAt + fadeOutMs;
      const phase = elapsed < fadeInMs ? 'fade-in' : elapsed < fadeOutAt ? 'hold' : elapsed < hiddenAt ? 'fade-out' : 'hidden';
      const opacity = elapsed < fadeInMs ? elapsed / fadeInMs : elapsed < fadeOutAt ? 1 : Math.max(0, 1 - (elapsed - fadeOutAt) / fadeOutMs);
      present({ phase, opacity });
      if (elapsed >= closeAfterMs) {
        const completedSlots = solution;
        startedAt = null; solution = null;
        finish(completedSlots);
      }
    },
    cancel() {
      startedAt = null; solution = null;
      present({ phase: 'hidden', opacity: 0 });
    },
  };
}
