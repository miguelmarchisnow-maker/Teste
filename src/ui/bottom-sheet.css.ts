let _injected = false;

export function injectBottomSheetStyles(): void {
  if (_injected) return;
  _injected = true;
  const style = document.createElement('style');
  style.textContent = `
    body.size-sm.portrait .bottom-sheet-capable {
      position: fixed !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      top: auto !important;
      width: 100vw !important;
      max-width: 100vw !important;
      max-height: 85vh !important;
      border-radius: 16px 16px 0 0 !important;
      transform: translateY(0) !important;
      animation: orbital-bottom-sheet-in 220ms ease;
      overflow-y: auto;
    }
    @keyframes orbital-bottom-sheet-in {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}
