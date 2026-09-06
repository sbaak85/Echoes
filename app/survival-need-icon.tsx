/** Shared, scalable silhouettes for survival meters and food categories. */
export function SurvivalNeedIcon({ kind }: { kind: "hunger" | "thirst" }) {
  return (
    <svg className={`survival-need-icon is-${kind}`} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {kind === "hunger" ? (
        // Extended concept 2: rounded roast and a broad crescent wing cutout.
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M4 16.5C5.6 10.4 12 6.8 18.2 8.1C20.2 8.4 22 9.2 23.5 10.6L27 7C25.5 5.8 25.7 3.6 27.3 3C29.2 2.3 30.8 4 29.9 5.8C31.6 5.6 32.1 7.4 31 8.7C29.9 10 28.7 9.6 27.9 8.9L25 13C28.6 19.7 24.6 27 17.1 28C10.6 28.9 5.2 26.5 4.2 21.1C.8 21.3 .8 18.2 4 16.5ZM11.4 18.5C15.6 20.3 19.9 20.5 24 18.6C24.7 18.3 24.4 19.5 23.9 20.4C21.6 24.3 15.5 23.7 12.4 20.5C11.5 19.6 10.9 18.3 11.4 18.5Z"
        />
      ) : (
        <>
          <path fill="currentColor" d="M16 2C13 7 5 15 5 21A11 11 0 0 0 27 21C27 15 19 7 16 2Z" />
          <path d="M10 19C8.5 23 11 26 14 26" fill="none" stroke="#d4fbff" strokeWidth="2" strokeLinecap="round" opacity=".8" />
        </>
      )}
    </svg>
  );
}
