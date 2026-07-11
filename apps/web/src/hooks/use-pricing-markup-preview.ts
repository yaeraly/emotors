'use client';

import { useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import type { MarkupPreviewResponse, MarkupRowEditorState } from '@/lib/pricing-markup-preview';

const PREVIEW_DEBOUNCE_MS = 300;
const FLASH_DURATION_MS = 650;

type RetailPreviewPayload = {
  minimumSellingMarkupPercent: number;
  recommendedRetailMarkupPercent: number;
  maximumRetailMarkupOverridePercent?: number | null;
};

type WholesalePreviewPayload = {
  minimumWholesaleMarkupPercent: number;
  recommendedWholesaleMarkupPercent: number;
  maximumWholesaleMarkupOverridePercent?: number | null;
};

type PreviewPayload = RetailPreviewPayload | WholesalePreviewPayload;

function isValidMarkup(value: number) {
  return Number.isFinite(value) && value >= 0;
}

export function usePricingMarkupPreview<T extends { id: string } & MarkupRowEditorState>(
  channel: 'retail' | 'wholesale',
  setRows: React.Dispatch<React.SetStateAction<T[]>>,
) {
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const controllersRef = useRef<Record<string, AbortController>>({});
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearFlash = useCallback(
    (productId: string) => {
      setRows((current) =>
        current.map((row) =>
          row.id === productId
            ? ({
                ...row,
                flash: { min: false, rec: false, max: false },
              } as T)
            : row,
        ),
      );
    },
    [setRows],
  );

  const applyPreviewResult = useCallback(
    (productId: string, result: MarkupPreviewResponse) => {
      setRows((current) =>
        current.map((row) => {
          if (row.id !== productId) return row;

          const isDirty =
            Math.abs(row.draftMinMarkup - row.savedMinMarkup) > 0.001 ||
            Math.abs(row.draftRecommendedMarkup - row.savedRecMarkup) > 0.001;

          if (result.validationStatus === 'ERROR' || !result.preview) {
            return {
              ...row,
              previewValidationErrors: result.validationErrors,
              previewValid: false,
              isDirty,
              isPreviewing: false,
            } as T;
          }

          const flash = {
            min: Math.abs(row.displayMinPrice - result.preview.minimumPriceKgs) > 0.01,
            rec: Math.abs(row.displayRecPrice - result.preview.recommendedPriceKgs) > 0.01,
            max: Math.abs(row.displayMaxPrice - result.preview.maximumPriceKgs) > 0.01,
          };

          if (flashTimersRef.current[productId]) {
            clearTimeout(flashTimersRef.current[productId]);
          }
          flashTimersRef.current[productId] = setTimeout(() => clearFlash(productId), FLASH_DURATION_MS);

          return {
            ...row,
            displayMinPrice: result.preview.minimumPriceKgs,
            displayRecPrice: result.preview.recommendedPriceKgs,
            displayMaxPrice: result.preview.maximumPriceKgs,
            displayMaxMarkup: result.preview.effectiveMaximumMarkupPercent,
            displayMaxSource: result.preview.maximumMarkupSource,
            previewValidationErrors: [],
            previewValid: true,
            flash,
            isDirty,
            isPreviewing: false,
          } as T;
        }),
      );
    },
    [clearFlash, setRows],
  );

  const runPreview = useCallback(
    async (productId: string, payload: PreviewPayload) => {
      controllersRef.current[productId]?.abort();
      const controller = new AbortController();
      controllersRef.current[productId] = controller;

      setRows((current) =>
        current.map((row) => (row.id === productId ? ({ ...row, isPreviewing: true } as T) : row)),
      );

      try {
        const result = await apiFetch<MarkupPreviewResponse>(`/pricing/${channel}/${productId}/preview`, {
          method: 'POST',
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        applyPreviewResult(productId, result);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setRows((current) =>
          current.map((row) =>
            row.id === productId
              ? ({
                  ...row,
                  isPreviewing: false,
                  previewValidationErrors: [
                    error instanceof Error ? error.message : 'Preview failed',
                  ],
                  previewValid: false,
                } as T)
              : row,
          ),
        );
      }
    },
    [applyPreviewResult, channel, setRows],
  );

  const schedulePreview = useCallback(
    (productId: string, payload: PreviewPayload) => {
      const min =
        channel === 'retail'
          ? (payload as RetailPreviewPayload).minimumSellingMarkupPercent
          : (payload as WholesalePreviewPayload).minimumWholesaleMarkupPercent;
      const rec =
        channel === 'retail'
          ? (payload as RetailPreviewPayload).recommendedRetailMarkupPercent
          : (payload as WholesalePreviewPayload).recommendedWholesaleMarkupPercent;

      if (!isValidMarkup(min) || !isValidMarkup(rec)) {
        setRows((current) =>
          current.map((row) => {
            if (row.id !== productId) return row;
            return {
              ...row,
              previewValidationErrors: [],
              previewValid: false,
              isDirty:
                Math.abs(row.draftMinMarkup - row.savedMinMarkup) > 0.001 ||
                Math.abs(row.draftRecommendedMarkup - row.savedRecMarkup) > 0.001,
            } as T;
          }),
        );
        return;
      }

      if (timersRef.current[productId]) {
        clearTimeout(timersRef.current[productId]);
      }

      timersRef.current[productId] = setTimeout(() => {
        void runPreview(productId, payload);
      }, PREVIEW_DEBOUNCE_MS);
    },
    [channel, runPreview, setRows],
  );

  const cancelRowEdits = useCallback(
    (productId: string) => {
      if (timersRef.current[productId]) {
        clearTimeout(timersRef.current[productId]);
        delete timersRef.current[productId];
      }
      controllersRef.current[productId]?.abort();
      delete controllersRef.current[productId];
      if (flashTimersRef.current[productId]) {
        clearTimeout(flashTimersRef.current[productId]);
        delete flashTimersRef.current[productId];
      }

      setRows((current) =>
        current.map((row) => {
          if (row.id !== productId) return row;

          const minPrice =
            channel === 'retail'
              ? Number((row as { minimumRetailPriceKgs?: number }).minimumRetailPriceKgs ?? row.displayMinPrice)
              : Number((row as { minimumWholesalePriceKgs?: number }).minimumWholesalePriceKgs ?? row.displayMinPrice);
          const recPrice =
            channel === 'retail'
              ? Number((row as { recommendedRetailPriceKgs?: number }).recommendedRetailPriceKgs ?? row.displayRecPrice)
              : Number((row as { recommendedWholesalePriceKgs?: number }).recommendedWholesalePriceKgs ?? row.displayRecPrice);
          const maxPrice =
            channel === 'retail'
              ? Number((row as { maximumRetailPriceKgs?: number }).maximumRetailPriceKgs ?? row.displayMaxPrice)
              : Number((row as { maximumWholesalePriceKgs?: number }).maximumWholesalePriceKgs ?? row.displayMaxPrice);
          const maxMarkup =
            channel === 'retail'
              ? Number(
                  (row as { effectiveMaximumRetailMarkupPercent?: number }).effectiveMaximumRetailMarkupPercent ??
                    row.displayMaxMarkup,
                )
              : Number(
                  (row as { effectiveMaximumWholesaleMarkupPercent?: number }).effectiveMaximumWholesaleMarkupPercent ??
                    row.displayMaxMarkup,
                );
          const maxSource =
            channel === 'retail'
              ? ((row as { maximumRetailMarkupSource?: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE' }).maximumRetailMarkupSource ??
                  row.displayMaxSource)
              : ((row as { maximumWholesaleMarkupSource?: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE' }).maximumWholesaleMarkupSource ??
                  row.displayMaxSource);

          return {
            ...row,
            draftMinMarkup: row.savedMinMarkup,
            draftRecommendedMarkup: row.savedRecMarkup,
            displayMinPrice: minPrice,
            displayRecPrice: recPrice,
            displayMaxPrice: maxPrice,
            displayMaxMarkup: maxMarkup,
            displayMaxSource: maxSource,
            previewValidationErrors: [],
            previewValid: null,
            flash: { min: false, rec: false, max: false },
            isDirty: false,
            isPreviewing: false,
          } as T;
        }),
      );
    },
    [setRows],
  );

  useEffect(() => {
    const timers = timersRef.current;
    const flashTimers = flashTimersRef.current;
    const controllers = controllersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      Object.values(flashTimers).forEach(clearTimeout);
      Object.values(controllers).forEach((controller) => controller.abort());
    };
  }, []);

  return { schedulePreview, cancelRowEdits, runPreview };
}
