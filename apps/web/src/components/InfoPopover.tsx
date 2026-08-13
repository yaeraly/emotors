'use client';

import { ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  label: string;
  content: ReactNode;
  className?: string;
};

const POPOVER_WIDTH = 288;

export function InfoPopover({ label, content, className }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const contentId = useId();

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const popoverHeight = popoverRef.current?.offsetHeight ?? 220;

    let top = rect.bottom + margin;
    let left = rect.left;

    if (left + POPOVER_WIDTH > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - POPOVER_WIDTH - margin);
    }
    if (left < margin) left = margin;

    if (top + popoverHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - popoverHeight - margin);
    }
    if (top < margin) top = margin;

    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next && popoverRef.current?.contains(next)) return;
          setOpen(false);
        }}
        className={
          className ??
          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
        }
      >
        ?
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              id={contentId}
              role="tooltip"
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                zIndex: 9999,
                width: POPOVER_WIDTH,
              }}
              className="rounded-xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
