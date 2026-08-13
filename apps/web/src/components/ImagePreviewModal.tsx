'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

type PreviewImage = {
  src: string;
  alt?: string;
  label?: string;
};

type ImagePreviewModalProps = {
  images: PreviewImage[];
  initialIndex?: number;
  title: string;
  subtitle?: string;
  onClose: () => void;
};

const minZoom = 0.5;
const maxZoom = 5;

export function ImagePreviewModal({
  images,
  initialIndex = 0,
  title,
  subtitle,
  onClose,
}: ImagePreviewModalProps) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [touchDistance, setTouchDistance] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const activeImage = images[activeIndex];

  const canNavigate = images.length > 1;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'ArrowRight') next();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    setZoom(1);
    setTouchDistance(null);
  }, [activeIndex]);

  const imageStyle = useMemo(
    () => ({
      transform: `scale(${zoom})`,
    }),
    [zoom],
  );

  function clampZoom(value: number) {
    return Math.min(maxZoom, Math.max(minZoom, Number(value.toFixed(2))));
  }

  function zoomIn() {
    setZoom((current) => clampZoom(current + 0.25));
  }

  function zoomOut() {
    setZoom((current) => clampZoom(current - 0.25));
  }

  function fitToScreen() {
    setZoom(1);
  }

  function previous() {
    if (!canNavigate) return;
    setActiveIndex((current) => (current === 0 ? images.length - 1 : current - 1));
  }

  function next() {
    if (!canNavigate) return;
    setActiveIndex((current) => (current + 1) % images.length);
  }

  async function openFullscreen() {
    if (!dialogRef.current || !document.fullscreenEnabled) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => null);
      return;
    }
    await dialogRef.current.requestFullscreen().catch(() => null);
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setZoom((current) => clampZoom(current + (event.deltaY < 0 ? 0.15 : -0.15)));
  }

  function onTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2) {
      setTouchDistance(distance(event.touches[0], event.touches[1]));
    }
  }

  function onTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2 || touchDistance === null) return;
    const nextDistance = distance(event.touches[0], event.touches[1]);
    const delta = (nextDistance - touchDistance) / 250;
    setZoom((current) => clampZoom(current + delta));
    setTouchDistance(nextDistance);
  }

  if (!activeImage) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div ref={dialogRef} className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
            {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={zoomOut} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" type="button">-</button>
            <span className="min-w-14 text-center text-sm font-semibold">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" type="button">+</button>
            <button onClick={fitToScreen} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" type="button">Fit</button>
            <button onClick={() => void openFullscreen()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" type="button">Fullscreen</button>
            <button onClick={onClose} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" type="button">
              {t('common.close')}
            </button>
          </div>
        </header>

        <div
          className="relative flex flex-1 items-center justify-center overflow-auto bg-slate-100 p-4 touch-none"
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={() => setTouchDistance(null)}
        >
          {canNavigate ? (
            <>
              <button onClick={previous} className="absolute left-3 top-1/2 z-10 rounded-full bg-white/90 px-4 py-3 text-xl font-black shadow" type="button">‹</button>
              <button onClick={next} className="absolute right-3 top-1/2 z-10 rounded-full bg-white/90 px-4 py-3 text-xl font-black shadow" type="button">›</button>
            </>
          ) : null}
          <img
            src={activeImage.src}
            alt={activeImage.alt ?? title}
            className="max-h-full max-w-full select-none object-contain transition-transform duration-100"
            style={imageStyle}
            draggable={false}
          />
        </div>

        {images.length > 1 ? (
          <footer className="flex gap-2 overflow-x-auto border-t border-slate-200 p-3">
            {images.map((image, index) => (
              <button
                key={`${image.src}-${index}`}
                onClick={() => setActiveIndex(index)}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border ${index === activeIndex ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}
                type="button"
              >
                <img src={image.src} alt={image.alt ?? ''} className="h-full w-full object-cover" />
              </button>
            ))}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function distance(first: React.Touch, second: React.Touch) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}
