let _injected = false;

export function injectBottomSheetStyles(): void {
  if (_injected) return;
  _injected = true;
  const style = document.createElement('style');
  style.textContent = `
    body.size-sm.portrait .bottom-sheet-capable,
    body.portrait.size-md .bottom-sheet-capable {
      position: fixed !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      top: auto !important;
      margin: 0 !important;
      width: 100vw !important;
      max-width: 100vw !important;
      max-height: 85vh !important;
      border-radius: 16px 16px 0 0 !important;
      transform: translateY(100%) !important;
      transition: transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1) !important;
      overflow-y: auto;
    }
    body.size-sm.portrait .bottom-sheet-capable.visible,
    body.portrait.size-md .bottom-sheet-capable.visible {
      transform: translateY(0) !important;
    }
    @media (max-width: 820px) and (orientation: portrait) {
      .bottom-sheet-capable {
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        top: auto !important;
        margin: 0 !important;
        width: 100vw !important;
        max-width: 100vw !important;
        max-height: 85vh !important;
        border-radius: 16px 16px 0 0 !important;
        transform: translateY(100%) !important;
        transition: transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1) !important;
      }
      .bottom-sheet-capable.visible {
        transform: translateY(0) !important;
      }
    }
  `;
  document.head.appendChild(style);
}
