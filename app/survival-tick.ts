import { advanceSurvivalState, GAME_DAY_REAL_SECONDS, type SurvivalGameState } from "./survival-manager.ts";

/** Collect active gameplay time without allocating a survival state every frame. */
export class SurvivalTickAccumulator {
  private seconds = 0;
  private weightedDistance = 0;

  accumulate(seconds: number, distance = 0, speed = 0) {
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    this.seconds += seconds;
    if (Number.isFinite(distance) && distance > 0 && Number.isFinite(speed)) {
      this.weightedDistance += distance * Math.pow(Math.max(0.25, speed / 210), 0.25);
    }
    return this.seconds >= 1;
  }

  clear() {
    this.seconds = 0;
    this.weightedDistance = 0;
  }

  /** Clock display includes active time still waiting for survival settlement. */
  getClockGameMinutes(settledGameMinutes: number) {
    return settledGameMinutes + this.seconds * (24 * 60) / GAME_DAY_REAL_SECONDS;
  }

  flush(current: SurvivalGameState) {
    if (this.seconds <= 0) return current;
    const seconds = this.seconds;
    const distance = this.weightedDistance;
    // Clear before publishing: callbacks may themselves request a save/flush.
    this.clear();
    return advanceSurvivalState(current, seconds, distance, 210);
  }
}
