import type { CursorClientPoint, CursorOwner } from "./cursor-ownership.ts";

/** Reconcile browser presentation independently of owner-change notifications.
 * CSS state is not proof that the element under a stationary mouse is hidden. */
export class CursorPresentationGuard {
  private overrides = new Map<HTMLElement, { value: string; priority: string }>();
  private readonly doc: Document;
  constructor(doc: Document) { this.doc = doc; }

  private targets(point: CursorClientPoint | null) {
    const hovered = point ? [] : [...this.doc.querySelectorAll<HTMLElement>(":hover")];
    const hit = point ? this.doc.elementFromPoint(point.x, point.y) : null;
    return [...new Set([this.doc.documentElement, this.doc.body, ...hovered, hit])]
      .filter((element): element is HTMLElement => Boolean(element && "style" in element));
  }

  reconcile(owner: CursorOwner, point: CursorClientPoint | null) {
    if (this.doc.documentElement.dataset.cursorOwner !== owner) this.doc.documentElement.dataset.cursorOwner = owner;
    if (owner === "mouse") {
      this.restore();
      return true;
    }
    const targets = this.targets(point);
    for (const element of targets) {
      if (!this.overrides.has(element)) this.overrides.set(element, {
        value: element.style.getPropertyValue("cursor"),
        priority: element.style.getPropertyPriority("cursor"),
      });
      if (element.style.getPropertyValue("cursor") !== "none" ||
        element.style.getPropertyPriority("cursor") !== "important") {
        element.style.setProperty("cursor", "none", "important");
      }
    }
    return targets.every(element => this.doc.defaultView?.getComputedStyle(element).cursor === "none");
  }

  private restore() {
    for (const [element, previous] of this.overrides) {
      // Do not overwrite a newer cursor set by another component.
      if (element.style.getPropertyValue("cursor") !== "none" ||
        element.style.getPropertyPriority("cursor") !== "important") continue;
      if (previous.value) element.style.setProperty("cursor", previous.value, previous.priority);
      else element.style.removeProperty("cursor");
    }
    this.overrides.clear();
  }

  dispose() { this.restore(); }
}

export const CURSOR_POSITION_STORAGE_KEY = "echoes:cursor-last-mouse";

export function parseCursorPosition(serialized: string | null, width: number, height: number): CursorClientPoint | null {
  if (!serialized) return null;
  try {
    const point = JSON.parse(serialized);
    if (typeof point?.x !== "number" || typeof point?.y !== "number" ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) return null;
    return { x: point.x, y: point.y };
  } catch { return null; }
}
