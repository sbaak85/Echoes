/** A newly entered screen must see neutral controls before accepting input. */
export class PrologueGamepadInput {
  private armed = false;
  private previous: boolean[] = [];
  reset() { this.armed = false; this.previous = []; }
  sample(pad: { axes: readonly number[]; buttons: readonly { pressed: boolean }[] } | null) {
    const idle = { confirm: false, back: false, history: false, directional: false, x: 0, y: 0 };
    if (!pad) { this.reset(); return idle; }
    const pressed = pad.buttons.map(button => button.pressed);
    const axis = (index: number) => {
      const value = pad.axes[index] ?? 0;
      return Number.isFinite(value) && Math.abs(value) > 0.18 ? value : 0;
    };
    if (!this.armed) {
      this.armed = !pressed.some(Boolean) && [0, 1, 2, 3].every(index => axis(index) === 0);
      this.previous = pressed;
      return idle;
    }
    const edge = (index: number) => pressed[index] && !this.previous[index];
    const result = {
      confirm: !!edge(0), back: !!edge(1), history: !!edge(6),
      directional: Math.abs(axis(0)) > 0.55 || Math.abs(axis(1)) > 0.55 ||
        [12, 13, 14, 15].some(index => pressed[index]),
      x: axis(2), y: axis(3),
    };
    this.previous = pressed;
    return result;
  }
}
