'use client';
import { useEffect, type RefObject } from 'react';

/** Lock/focus only an open mobile drawer; restore the page and trigger on close. */
export function useMobileNavigation({ open, onClose, panelRef, triggerRef, desktopQuery, ready }: {
  open: boolean; onClose: () => void; panelRef: RefObject<HTMLElement>;
  triggerRef: RefObject<HTMLButtonElement>; desktopQuery: string; ready: boolean;
}) {
  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia(desktopQuery);
    const panel = panelRef.current;
    const sync = () => {
      if (panel) {
        panel.inert = !media.matches && !open;
        if (panel.inert) panel.setAttribute('aria-hidden', 'true');
        else panel.removeAttribute('aria-hidden');
      }
      if (media.matches && open) onClose();
    };
    sync();
    media.addEventListener('change', sync);
    return () => { media.removeEventListener('change', sync); if (panel) { panel.inert = false; panel.removeAttribute('aria-hidden'); } };
  }, [open, onClose, panelRef, desktopQuery, ready]);

  useEffect(() => {
    if (!ready || !open || window.matchMedia(desktopQuery).matches) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex="0"]'))
      .filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (focusable()[0] ?? panel).focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      const target = triggerRef.current ?? previousFocus;
      if (target?.isConnected && target.getClientRects().length > 0) target.focus();
    };
  }, [open, onClose, panelRef, triggerRef, desktopQuery, ready]);
}
