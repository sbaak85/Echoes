/** Shared category silhouettes; color and size follow the surrounding UI. */
export function InventoryCategoryIcon({ kind }: { kind: "all" | "resource" | "tool" }) {
  return (
    <svg className="inventory-category-icon" viewBox={kind === "all" ? "0 0 24 24" : "0 0 32 32"} aria-hidden="true" focusable="false">
      {kind === "all" ? (
        // Approved concept 1: filled layout-grid, including its 2.4px outline.
        <g fill="currentColor" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </g>
      ) : kind === "tool" ? (
        <path fill="currentColor" fillRule="evenodd" d="M26 2L21 7L22 11L26 12L31 7C32 12 28 17 23 17C21.5 17 20 16.5 19 16L8.3 29.5C6.8 31.4 4 31.5 2.5 29.6C1 27.8 1.4 25.4 3.1 24L16.7 13C15 9 16.2 5 19.5 2.8C21.4 1.5 24 1.2 26 2ZM5.7 25.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z" transform="translate(0 2) scale(.9)" />
      ) : (
        <>
          <path d="M9 29C12 22 15 15 21 7C23 4 26 3 29 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path fill="currentColor" d="M12 24C6 24 4 20 5 16C10 16 13 19 12 24ZM15 19C9 18 8 14 9 10C14 11 17 15 15 19ZM19 13C14 11 14 7 16 3C21 5 22 9 19 13ZM14 23C14 18 18 16 23 17C22 22 18 25 14 23ZM18 17C19 12 23 11 28 13C26 17 22 20 18 17ZM23 10C26 6 30 7 32 10C28 13 25 13 23 10Z" />
        </>
      )}
    </svg>
  );
}
