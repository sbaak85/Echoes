export type CursorOwner = "mouse" | "gamepad" | "directional" | "touch";
export type CursorClientPoint = { x: number; y: number };

/** Shared by the world cursor and tools such as the welding gun. Coordinates
 * are client pixels, so each renderer converts through its own bounding rect. */
export class CursorOwnership {
  owner: CursorOwner = "mouse";
  lastMouse: CursorClientPoint | null = null;
  private mouseAnchor: CursorClientPoint | null = null;
  private listeners = new Set<(owner: CursorOwner, previous: CursorOwner) => void>();
  subscribe(listener: (owner: CursorOwner, previous: CursorOwner) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  take(owner: CursorOwner) {
    if (owner === this.owner) return;
    const previous = this.owner;
    this.owner = owner;
    this.mouseAnchor = this.lastMouse;
    this.listeners.forEach(listener => listener(owner, previous));
  }
  recordMouse(x: number, y: number, pressed = false) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const point = { x, y };
    const anchor = this.mouseAnchor;
    this.lastMouse = point;
    const deliberate = pressed || this.owner === "mouse" ||
      (anchor !== null && Math.hypot(x - anchor.x, y - anchor.y) >= 2);
    if (!anchor) this.mouseAnchor = point;
    if (deliberate) this.take("mouse");
    return deliberate;
  }
  reset() {
    this.take("mouse");
    this.lastMouse = null;
    this.mouseAnchor = null;
  }
}

export const cursorOwnership = new CursorOwnership();

/** Gate only controls, retaining device identity/connection diagnostics. */
export class GamepadHandoffGate {
  private blocked = false;
  requireNeutral() { this.blocked = true; }
  filter<T extends object>(input: T): T {
    if (!this.blocked) return input;
    const entries = Object.entries(input);
    const isControl = (key: string, value: unknown) =>
      typeof value === "number" || (typeof value === "boolean" && key.endsWith("Pressed"));
    if (entries.every(([key, value]) => !isControl(key, value) ||
      (typeof value === "number" ? Math.abs(value) <= 0.14 : !value))) {
      this.blocked = false;
      return input;
    }
    return Object.fromEntries(entries.map(([key, value]) =>
      [key, isControl(key, value) ? (typeof value === "number" ? 0 : false) : value])) as T;
  }
}
