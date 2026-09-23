import { useLayoutEffect, useRef } from "react";

export function confirmationLayout(availableWidth: number, availableHeight: number, height: number) {
  const width = Math.max(420, Math.min(600, availableWidth));
  return { width, compact: Math.max(0, Math.min(1, (560 - width) / 100)),
    label: Math.max(0, Math.min(1, (460 - width) / 40)),
    scale: Math.max(0.01, Math.min(1, availableWidth / width, availableHeight / Math.max(1, height))) };
}

/** Keep actual buttons/hit targets in the same transformed coordinate space. */
export function useResponsiveConfirmation() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const panel = ref.current, host = panel?.parentElement;
    if (!panel || !host) return;
    const update = () => {
      const width = Math.max(1, host.clientWidth - 24), height = Math.max(1, host.clientHeight - 24);
      const layout = confirmationLayout(width, height, panel.offsetHeight);
      panel.style.setProperty("--confirmation-width", `${layout.width}px`);
      panel.style.setProperty("--confirmation-compact", String(layout.compact));
      panel.style.setProperty("--confirmation-label", String(layout.label));
      // Reset before measuring so labels can grow again when the viewport widens.
      for (const label of panel.querySelectorAll<HTMLElement>(".item-change-visual-card > small, h3")) {
        label.style.removeProperty("font-size");
        const base = parseFloat(getComputedStyle(label).fontSize);
        const style = getComputedStyle(label);
        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const available = label.clientWidth - padding;
        const range = document.createRange();
        range.selectNodeContents(label);
        const scale = panel.getBoundingClientRect().width / panel.offsetWidth;
        const natural = Math.max(label.scrollWidth - padding, range.getBoundingClientRect().width / scale);
        if (natural > available && available > 0) {
          label.style.fontSize = `${Math.max(9, base * available / natural)}px`;
        }
      }
      panel.style.setProperty("--confirmation-scale", String(confirmationLayout(width, height, panel.offsetHeight).scale));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    observer.observe(panel);
    const content = new MutationObserver(update);
    content.observe(panel, {childList:true,subtree:true,characterData:true});
    return () => {observer.disconnect();content.disconnect();};
  });
  return ref;
}
