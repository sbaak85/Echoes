import type { CSSProperties } from "react";

type MainObjectiveMarkerProps = {
  durationMs: number;
};

export function MainObjectiveMarker({ durationMs }: MainObjectiveMarkerProps) {
  return (
    <section
      className="main-objective-marker-preview"
      style={{
        "--main-objective-marker-duration": `${Math.max(1, durationMs)}ms`,
      } as CSSProperties}
      role="status"
      aria-label="主要任務目標"
    >
      <div className="main-objective-marker-motion" aria-hidden="true">
        <svg viewBox="0 0 112 148" focusable="false">
          <defs>
            <linearGradient id="main-objective-gold" x1="0" y1="0" x2="0.8" y2="1">
              <stop offset="0" stopColor="#fff4d2" />
              <stop offset="0.42" stopColor="#d8bd7a" />
              <stop offset="1" stopColor="#8f6b32" />
            </linearGradient>
            <linearGradient id="main-objective-glass" x1="0.1" y1="0" x2="0.9" y2="1">
              <stop offset="0" stopColor="#fff8dc" stopOpacity="0.24" />
              <stop offset="0.52" stopColor="#caa761" stopOpacity="0.11" />
              <stop offset="1" stopColor="#765326" stopOpacity="0.04" />
            </linearGradient>
            <radialGradient id="main-objective-core">
              <stop offset="0" stopColor="#fffdf2" />
              <stop offset="0.55" stopColor="#e7d19a" />
              <stop offset="1" stopColor="#a98242" />
            </radialGradient>
            <filter id="main-objective-glow" x="-80%" y="-60%" width="260%" height="240%">
              <feGaussianBlur stdDeviation="1.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            className="main-objective-marker-frame"
            d="M56 10 99 53 56 134 13 53Z"
            fill="url(#main-objective-glass)"
            stroke="url(#main-objective-gold)"
          />
          <path
            className="main-objective-marker-inner"
            d="M56 27 82 54 56 106 30 54Z"
            fill="rgba(255, 224, 132, 0.08)"
            stroke="rgba(255, 245, 202, 0.86)"
          />
          <path
            className="main-objective-marker-spine"
            d="M56 76V128"
            stroke="url(#main-objective-gold)"
          />
          <circle
            className="main-objective-marker-core"
            cx="56"
            cy="54"
            r="4.8"
            fill="url(#main-objective-core)"
            filter="url(#main-objective-glow)"
          />
        </svg>
      </div>
    </section>
  );
}
