export type WorldItemSpawnPoint = { x: number; y: number };

export type WorldItemSpawnMotion = {
  startedAt: number;
  start: WorldItemSpawnPoint;
  landing: WorldItemSpawnPoint;
  end: WorldItemSpawnPoint;
  arcHeight: number;
  bounceHeight: number;
  flightDurationMs: number;
  bounceDurationMs: number;
  slideDurationMs: number;
  launchRotation: number;
};

export type WorldItemSpawnPose = {
  position: WorldItemSpawnPoint;
  finished: boolean;
  airborne: boolean;
  phase: "flight" | "bounce" | "slide" | "settled";
  rotation: number;
  scaleX: number;
  scaleY: number;
};

/**
 * 以比舊版更強的基準力道產生遠近差異。
 * 16 ± 8px，因此最短仍會比舊版多拋 8px，不會出現更輕的結果。
 */
export function getWorldItemThrowDistanceBoost(
  random: () => number = Math.random,
) {
  const normalizedRandom = Math.max(0, Math.min(1, random()));
  return 8 + normalizedRandom * 16;
}

export function createWorldItemSpawnMotion(
  startedAt: number,
  start: WorldItemSpawnPoint,
  landing: WorldItemSpawnPoint,
  end: WorldItemSpawnPoint,
  random: () => number = Math.random,
): WorldItemSpawnMotion {
  return {
    startedAt,
    start,
    landing,
    end,
    arcHeight: 36 + random() * 12,
    bounceHeight: 8 + random() * 4,
    flightDurationMs: 350 + random() * 70,
    bounceDurationMs: 160,
    slideDurationMs: 230,
    launchRotation: (random() - 0.5) * 0.42,
  };
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeOutQuad = (value: number) => 1 - (1 - value) * (1 - value);
const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

const mix = (start: number, end: number, progress: number) =>
  start + (end - start) * progress;

export function getWorldItemSpawnPose(
  motion: WorldItemSpawnMotion,
  now: number,
): WorldItemSpawnPose {
  const elapsed = Math.max(0, now - motion.startedAt);
  if (elapsed < motion.flightDurationMs) {
    const progress = clamp01(elapsed / Math.max(1, motion.flightDurationMs));
    const travelProgress = easeOutQuad(progress);
    return {
      position: {
        x: mix(motion.start.x, motion.landing.x, travelProgress),
        y:
          mix(motion.start.y, motion.landing.y, travelProgress) -
          4 * progress * (1 - progress) * motion.arcHeight,
      },
      finished: false,
      airborne: true,
      phase: "flight",
      rotation: motion.launchRotation * (1 - progress),
      scaleX: mix(0.84, 1, progress),
      scaleY: mix(0.84, 1, progress),
    };
  }

  const bounceEnd = {
    x: mix(motion.landing.x, motion.end.x, 0.38),
    y: mix(motion.landing.y, motion.end.y, 0.38),
  };
  const bounceElapsed = elapsed - motion.flightDurationMs;
  if (bounceElapsed < motion.bounceDurationMs) {
    const progress = clamp01(
      bounceElapsed / Math.max(1, motion.bounceDurationMs),
    );
    const groundX = mix(motion.landing.x, bounceEnd.x, easeOutQuad(progress));
    const groundY = mix(motion.landing.y, bounceEnd.y, easeOutQuad(progress));
    const impactRecovery = easeOutCubic(progress);
    return {
      position: {
        x: groundX,
        y:
          groundY -
          4 * progress * (1 - progress) * motion.bounceHeight,
      },
      finished: false,
      airborne: progress > 0 && progress < 1,
      phase: "bounce",
      rotation: 0,
      scaleX: mix(1.14, 1, impactRecovery),
      scaleY: mix(0.82, 1, impactRecovery),
    };
  }

  const slideProgress = clamp01(
    (bounceElapsed - motion.bounceDurationMs) /
      Math.max(1, motion.slideDurationMs),
  );
  const easedSlideProgress = easeOutCubic(slideProgress);
  const finished = slideProgress >= 1;
  return {
    position: {
      x: mix(bounceEnd.x, motion.end.x, easedSlideProgress),
      y: mix(bounceEnd.y, motion.end.y, easedSlideProgress),
    },
    finished,
    airborne: false,
    phase: finished ? "settled" : "slide",
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };
}
