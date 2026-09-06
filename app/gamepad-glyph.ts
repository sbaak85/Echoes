/** One vector source for DOM hints and the world's Canvas interaction prompt. */
export const GAMEPAD_GLYPHS = [
  "A", "B", "X", "Y", "LB", "RB", "LT", "RT", "LS", "RS", "L3", "R3",
  "DPad", "DPadLeft", "DPadRight", "DPadUp", "DPadDown", "Start", "Select",
] as const;
export type GamepadGlyphName = typeof GAMEPAD_GLYPHS[number];

export const GAMEPAD_GLYPH_LABELS: Record<GamepadGlyphName, string> = {
  A: "手把 A 鍵", B: "手把 B 鍵", X: "手把 X 鍵", Y: "手把 Y 鍵",
  LB: "手把 LB 鍵", RB: "手把 RB 鍵", LT: "手把 LT 鍵", RT: "手把 RT 鍵",
  LS: "左搖桿", RS: "右搖桿", L3: "左搖桿按下", R3: "右搖桿按下",
  DPad: "十字鍵", DPadLeft: "十字鍵左", DPadRight: "十字鍵右",
  DPadUp: "十字鍵上", DPadDown: "十字鍵下", Start: "Start 鍵", Select: "Select 鍵",
};

const cross = "M14 3H26V13H36V25H26V35H14V25H4V13H14Z";
const arrows: Partial<Record<GamepadGlyphName, string>> = {
  DPadLeft: "M8 19L13 15V23Z", DPadRight: "M32 19L27 15V23Z",
  DPadUp: "M20 7L16 12H24Z", DPadDown: "M20 31L16 26H24Z",
};

export function getGamepadGlyphSvg(name: GamepadGlyphName) {
  const text = (label: string, x = 20, y = 21, size = 16) =>
    `<text x="${x}" y="${y}" fill="#ffe6a0" font-family="Consolas,monospace" font-size="${size}" font-weight="700" text-anchor="middle" dominant-baseline="central">${label}</text>`;
  let body: string;
  if (/^[ABXY]$/.test(name)) {
    body = `<circle cx="20" cy="21" r="16" fill="#090e0b"/><circle cx="20" cy="18.5" r="16" fill="url(#surface)" stroke="#d4b975" stroke-width="1.2"/><path d="M8 27Q20 37 32 27" fill="none" stroke="#101711" stroke-width="2"/>${text(name, 20, 18, 25)}`;
  } else if (["LS", "RS", "L3", "R3"].includes(name)) {
    const click = name.endsWith("3");
    body = `<g transform="translate(${click ? -3 : 0} 0)"><ellipse cx="20" cy="32" rx="13" ry="4" fill="#76633d"/><ellipse cx="20" cy="29" rx="13" ry="4" fill="url(#surface)" stroke="#d2ba80" stroke-width="1.8"/><path d="M20 18V29" stroke="#e8cf8b" stroke-width="4"/><ellipse cx="20" cy="${click ? 19 : 14}" rx="11" ry="8" fill="#8b7649"/><ellipse cx="20" cy="${click ? 16 : 11}" rx="11" ry="8" fill="url(#surface)" stroke="#ffe6a0" stroke-width="1.8"/>${text(name[0], 20, click ? 16 : 11, 12)}</g>${click ? '<path d="M35 7V20M31 16L35 21L39 16" fill="none" stroke="#ffe6a0" stroke-width="2" stroke-linejoin="round"/>' : ""}`;
  } else if (name.startsWith("DPad")) {
    body = `<path d="${cross}" transform="translate(0 3)" fill="#6b5632" stroke="#8e7749" stroke-width="1.1"/><path d="${cross}" fill="url(#surface)" stroke="#d0b779" stroke-width="1.3"/><path d="M15 4H25M5 14V24M15 26V34" stroke="#f4d99a" stroke-opacity=".4" fill="none"/>${arrows[name] ? `<path d="${arrows[name]}" fill="#ffe6a0"/>` : '<circle cx="20" cy="19" r="2" fill="#ffe6a0"/>'}`;
  } else {
    const face = name === "Start"
      ? '<g transform="translate(0 -1)"><path d="M12 13H28M12 20H28M12 27H28" stroke="#ffe6a0" stroke-width="2"/></g>'
      : name === "Select"
        ? '<g transform="translate(0 -1)"><rect x="10" y="11" width="14" height="11" rx="1" fill="#282e23" stroke="#ffe6a0" stroke-width="1.5"/><rect x="16" y="17" width="14" height="11" rx="1" fill="#282e23" stroke="#ffe6a0" stroke-width="1.5"/></g>'
        : text(name, 20, 17, 19.5);
    body = `<rect x="1" y="6" width="38" height="29" rx="4" fill="#090e0b"/>
<rect x="1" y="4" width="38" height="29" rx="4" fill="#111810"/>
<path d="M5 4H35Q39 4 39 8V26Q39 29 35 29H5Q1 29 1 26V8Q1 4 5 4Z" fill="url(#surface)"/>
<path d="M3 27Q4 29 7 29H33Q36 29 37 27" fill="none" stroke="#5a5b43" stroke-opacity=".45" stroke-width=".7"/>
${face}
<rect x="1" y="4" width="38" height="29" rx="4" fill="none" stroke="#d4b975" stroke-width="1.1"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><defs><linearGradient id="surface" x2=".2" y2="1"><stop stop-color="#494c3e"/><stop offset=".55" stop-color="#30362b"/><stop offset="1" stop-color="#171e18"/></linearGradient></defs>${body}</svg>`;
}

const urls = new Map<GamepadGlyphName, string>();
export function getGamepadGlyphUrl(name: GamepadGlyphName) {
  let url = urls.get(name);
  if (!url) {
    url = `data:image/svg+xml,${encodeURIComponent(getGamepadGlyphSvg(name))}`;
    urls.set(name, url);
  }
  return url;
}

const aliases: Record<string, GamepadGlyphName[]> = {
  "左搖桿Click": ["L3"], "右搖桿Click": ["R3"], "左搖桿按下": ["L3"], "右搖桿按下": ["R3"],
  "左搖桿": ["LS"], "右搖桿": ["RS"], "十字鍵上下": ["DPadUp", "DPadDown"],
  "十字鍵左右": ["DPadLeft", "DPadRight"], "十字鍵左": ["DPadLeft"], "十字鍵右": ["DPadRight"],
  "十字鍵上": ["DPadUp"], "十字鍵下": ["DPadDown"], "十字鍵": ["DPad"],
  "◀": ["DPadLeft"], "▶": ["DPadRight"], "▲": ["DPadUp"], "▼": ["DPadDown"],
  "START": ["Start"], "SELECT": ["Select"],
};
for (const name of GAMEPAD_GLYPHS) aliases[name] = [name];
const tokenPattern = /\[(左搖桿Click|右搖桿Click|左搖桿按下|右搖桿按下|左搖桿|右搖桿|十字鍵(?:上下|左右|左|右|上|下)?|[◀▶▲▼]|START|SELECT|Start|Select|[LR][BTS3]|[ABXY])(?:鍵)?\]|左搖桿Click|右搖桿Click|左搖桿按下|右搖桿按下|左搖桿|右搖桿|十字鍵(?:上下|左右|左|右|上|下)?|(?<![A-Za-z0-9_])(?:START|SELECT|Start|Select|[LR][BTS3]|[ABXY])(?:鍵)?(?![A-Za-z0-9_])/g;

export type GamepadHintPart = { text: string; glyphs?: GamepadGlyphName[] };
/** Apply only to control hints, never arbitrary dialogue or diagnostic data. */
export function splitGamepadHint(text: string): GamepadHintPart[] {
  const parts: GamepadHintPart[] = [];
  let end = 0;
  for (const match of text.matchAll(tokenPattern)) {
    if (match.index > end) parts.push({ text: text.slice(end, match.index) });
    const token = (match[1] ?? match[0]).replace(/鍵$/, "");
    const glyphs = aliases[match[1] ?? match[0]] ?? aliases[token];
    parts.push({ text: match[0], glyphs });
    end = match.index + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end) });
  return parts;
}
