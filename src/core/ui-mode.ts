import { getConfig, onConfigChange } from './config';

export type UiSize = 'sm' | 'md' | 'lg';
export type UiOrientation = 'portrait' | 'landscape';

export interface UiMode {
  touch: boolean;
  size: UiSize;
  orientation: UiOrientation;
}

export interface UiModeInputs {
  coarsePointer: boolean;
  innerWidth: number;
  portrait: boolean;
}

export function computeUiMode(inputs: UiModeInputs): UiMode {
  const mode = getConfig().ui?.touchMode ?? 'auto';
  let touch: boolean;
  if (mode === 'on') touch = true;
  else if (mode === 'off') touch = false;
  else {
    // Coarse pointer without real hover = pure-touch device (iPad Pro in
    // landscape reports 1366px width but has no mouse). The old
    // `width <= 1024` gate mis-classified large tablets as desktop.
    const hasHover = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(hover: hover)').matches;
    touch = inputs.coarsePointer && !hasHover;
  }

  const size: UiSize =
    inputs.innerWidth < 600 ? 'sm'
    : inputs.innerWidth < 1024 ? 'md'
    : 'lg';

  const orientation: UiOrientation = inputs.portrait ? 'portrait' : 'landscape';
  return { touch, size, orientation };
}

let _current: UiMode = { touch: false, size: 'lg', orientation: 'landscape' };
let _installed = false;
let _coarseMql: MediaQueryList | null = null;
let _portraitMql: MediaQueryList | null = null;

function readInputs(): UiModeInputs {
  return {
    coarsePointer: _coarseMql?.matches ?? false,
    innerWidth: window.innerWidth,
    portrait: _portraitMql?.matches ?? (window.innerHeight > window.innerWidth),
  };
}

// Cache UA check — runs once per session; UA doesn't change at runtime.
let _isMobileUa: boolean | null = null;
function detectMobileUa(): boolean {
  if (_isMobileUa !== null) return _isMobileUa;
  if (typeof navigator === 'undefined') return (_isMobileUa = false);
  // iPadOS 13+ reports as Mac — also check `maxTouchPoints` to catch it.
  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIpad = /Macintosh/.test(ua)
    && typeof navigator.maxTouchPoints === 'number'
    && navigator.maxTouchPoints > 1;
  _isMobileUa = isMobileUa || isIpad;
  return _isMobileUa;
}

function applyBodyClasses(m: UiMode): void {
  const b = document.body.classList;
  b.toggle('touch', m.touch);
  b.toggle('portrait', m.orientation === 'portrait');
  b.toggle('landscape', m.orientation === 'landscape');
  b.toggle('size-sm', m.size === 'sm');
  b.toggle('size-md', m.size === 'md');
  b.toggle('size-lg', m.size === 'lg');
  // UA-based mobile flag — complements width/touch detection. Only
  // applied when the viewport is ALSO non-large, otherwise a touch-
  // capable MacBook/Mac reported as Macintosh+touchpoints gets the full
  // mobile layout on a desktop display, which is wrong.
  b.toggle('mobile-ua', detectMobileUa() && m.size !== 'lg');
}

export function getUiMode(): UiMode {
  return _current;
}

export function isTouchMode(): boolean {
  return _current.touch;
}

function recompute(): void {
  const next = computeUiMode(readInputs());
  const changed =
    next.touch !== _current.touch ||
    next.size !== _current.size ||
    next.orientation !== _current.orientation;
  _current = next;
  applyBodyClasses(_current);
  if (changed) {
    window.dispatchEvent(new CustomEvent('orbital:ui-mode-changed', { detail: next }));
  }
}

export function instalarUiMode(): void {
  if (_installed) return;
  _installed = true;
  _coarseMql = window.matchMedia('(pointer: coarse)');
  _portraitMql = window.matchMedia('(orientation: portrait)');
  _coarseMql.addEventListener('change', recompute);
  _portraitMql.addEventListener('change', recompute);
  window.addEventListener('resize', recompute);
  // iOS Safari fires orientationchange *before* innerWidth/innerHeight
  // update — reading dimensions synchronously returns stale values.
  // Delay the recompute so layout has committed the new orientation.
  window.addEventListener('orientationchange', () => {
    setTimeout(recompute, 100);
  });
  onConfigChange(recompute);
  recompute();
}
