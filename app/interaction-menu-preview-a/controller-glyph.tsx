/* eslint-disable @next/next/no-img-element -- the preview glyph is generated as an inline SVG */

type PreviewGamepadButton = "A" | "B" | "LS" | "DPAD";

const labels: Record<PreviewGamepadButton, string> = {
  A: "手把 A 鍵",
  B: "手把 B 鍵",
  LS: "左搖桿",
  DPAD: "十字方向鍵",
};

function getGlyphSvg(button: PreviewGamepadButton) {
  const face = button === "DPAD"
    ? `<path d="M15 5h10v10h10v10H25v10H15V25H5V15h10z" fill="url(#surface)" stroke="#d2ba80" stroke-width="1.8"/><path d="M18 9h4v6h-4zM18 25h4v6h-4zM9 18h6v4H9zM25 18h6v4h-6z" fill="#ffe6a0" opacity=".8"/>`
    : button === "LS"
    ? `<g><ellipse cx="20" cy="32" rx="13" ry="4" fill="#76633d"/><ellipse cx="20" cy="29" rx="13" ry="4" fill="url(#surface)" stroke="#d2ba80" stroke-width="1.8"/><path d="M20 18V29" stroke="#e8cf8b" stroke-width="4"/><ellipse cx="20" cy="14" rx="11" ry="8" fill="#8b7649"/><ellipse cx="20" cy="11" rx="11" ry="8" fill="url(#surface)" stroke="#ffe6a0" stroke-width="1.8"/><text x="20" y="11" fill="#ffe6a0" font-family="Consolas,monospace" font-size="12" font-weight="700" text-anchor="middle" dominant-baseline="central">L</text></g>`
    : `<circle cx="20" cy="21" r="16" fill="#090e0b"/><circle cx="20" cy="18.5" r="16" fill="url(#surface)" stroke="#d4b975" stroke-width="1.2"/><path d="M8 27Q20 37 32 27" fill="none" stroke="#101711" stroke-width="2"/><text x="20" y="18" fill="#ffe6a0" font-family="Consolas,monospace" font-size="25" font-weight="700" text-anchor="middle" dominant-baseline="central">${button}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><defs><linearGradient id="surface" x2=".2" y2="1"><stop stop-color="#494c3e"/><stop offset=".55" stop-color="#30362b"/><stop offset="1" stop-color="#171e18"/></linearGradient></defs>${face}</svg>`;
}

export function ControllerGlyph({ button }: { button: PreviewGamepadButton }) {
  const source = `data:image/svg+xml,${encodeURIComponent(getGlyphSvg(button))}`;
  return <img className="im-controller-glyph" src={source} alt={labels[button]}
    data-gamepad-glyph={button} draggable={false} />;
}
