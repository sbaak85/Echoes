"use client";

import {
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";

export type BlackScreenOverlayHandle = {
  setOpacity: (opacity255: number) => void;
};

type BlackScreenOverlayProps = {
  virtualCursorControlsEnabled: boolean;
};

const normalizeOpacity = (opacity255: number) =>
  Math.max(0, Math.min(255, Math.round(opacity255)));

/**
 * The only React owner of the full-screen blackout's visual state.
 *
 * Keeping this state inside the overlay prevents an unrelated parent render
 * (for example, removing story subtitles) from restoring stale black-screen
 * JSX attributes after an imperative fade has completed.
 */
export const BlackScreenOverlay = forwardRef<
  BlackScreenOverlayHandle,
  BlackScreenOverlayProps
>(function BlackScreenOverlay(
  { virtualCursorControlsEnabled },
  ref,
) {
  const [opacity255, setOpacity255] = useState(255);

  useImperativeHandle(ref, () => ({
    setOpacity: (nextOpacity255: number) => {
      setOpacity255(normalizeOpacity(nextOpacity255));
    },
  }), []);

  return (
    <img
      className="black-screen-image"
      src="./ui/black-screen.svg?v=3"
      alt=""
      data-opacity={opacity255}
      data-input-blocking={opacity255 > 0 ? "true" : "false"}
      data-virtual-cursor-enabled={virtualCursorControlsEnabled ? "true" : "false"}
      draggable={false}
      style={{ opacity: opacity255 / 255 }}
      aria-hidden="true"
    />
  );
});

