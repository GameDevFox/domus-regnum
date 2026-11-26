// Shared className for the Builder/game floating icon-buttons (the small bordered, soft-shadowed
// overlay buttons pinned over the 3D canvas and node graph). One source so restyling the overlay
// controls is a single edit instead of ~13. Compose with extra positioning classes as needed:
// `className={`absolute top-2 right-2 ${OVERLAY_ICON_BTN}`}`.
export const OVERLAY_ICON_BTN = "size-8 border shadow-[var(--shadow-soft)]";
