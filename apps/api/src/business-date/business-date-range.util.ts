import { BadRequestException } from '@nestjs/common';

export const BUSINESS_DATE_RANGE_ERROR_RU =
  'Дата операции должна быть в пределах последних 5 месяцев и не может быть позже текущей даты.';

/** Minimum allowed business date: current calendar date minus 5 whole months. */
export function businessDateMinimum(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - 5, now.getDate());
}

/** Maximum allowed business date: end of current local calendar day. */
export function businessDateMaximum(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

export function isBusinessDateWithinAllowedRange(date: Date, now = new Date()): boolean {
  const min = businessDateMinimum(now);
  const max = businessDateMaximum(now);
  return date.getTime() >= min.getTime() && date.getTime() <= max.getTime();
}

export function assertBusinessDateWithinAllowedRange(date: Date, now = new Date()) {
  if (!isBusinessDateWithinAllowedRange(date, now)) {
    throw new BadRequestException({
      message: BUSINESS_DATE_RANGE_ERROR_RU,
      code: 'BUSINESS_DATE_OUT_OF_RANGE',
    });
  }
}

export function getAllowedBusinessDateRange(now = new Date()) {
  const min = businessDateMinimum(now);
  const max = businessDateMaximum(now);
  return {
    minimumDate: min.toISOString(),
    maximumDate: max.toISOString(),
    minimumDateLocal: formatLocalDateInput(min),
    maximumDateLocal: formatLocalDateInput(max),
  };
}

export function formatLocalDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseBusinessDateInput(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException({ message: 'Invalid date format', code: 'INVALID_DATE' });
  }
  return parsed;
}
