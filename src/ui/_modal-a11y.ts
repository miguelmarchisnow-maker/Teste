// Shared a11y helpers for modals: role/aria scaffolding and a Tab focus trap.
// Used across confirm-dialog, save-modal, lore-modal, etc. to guarantee
// consistent screen-reader behavior and keyboard navigation.

export function setupDialog(
  container: HTMLElement,
  titleId: string,
): void {
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', titleId);
}

/** Returns a keydown handler that traps Tab focus inside `container`.
 *  Caller is responsible for adding/removing it on open/close. */
export function trapFocusHandler(container: HTMLElement): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.key !== 'Tab') return;
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
}
