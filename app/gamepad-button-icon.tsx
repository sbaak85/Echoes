/* eslint-disable @next/next/no-img-element -- shared SVG also renders on Canvas */
import { GAMEPAD_GLYPH_LABELS, getGamepadGlyphUrl, splitGamepadHint, type GamepadGlyphName } from "./gamepad-glyph";

export function GamepadButtonIcon({ button }: { button: GamepadGlyphName }) {
  return <img className="gamepad-button-icon" src={getGamepadGlyphUrl(button)}
    alt={GAMEPAD_GLYPH_LABELS[button]} data-gamepad-glyph={button} draggable={false} />;
}

export function GamepadHint({ text, enabled = true }: { text: string; enabled?: boolean }) {
  if (!enabled) return <>{text}</>;
  return <>{splitGamepadHint(text).map((part, index) => part.glyphs
    ? <span className="gamepad-glyph-group" key={index}>{part.glyphs.map((button, glyphIndex) =>
      <GamepadButtonIcon key={`${button}-${glyphIndex}`} button={button} />)}</span>
    : part.text)}</>;
}
