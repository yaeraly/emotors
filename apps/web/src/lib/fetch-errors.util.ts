const NETWORK_ERROR_PATTERNS = [
  'Failed to fetch',
  'NetworkError',
  'Load failed',
  'Network request failed',
  'The Internet connection appears to be offline',
];

export function isNetworkFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export function mapFetchError(
  error: unknown,
  options: {
    fallback?: string;
    networkMessage?: string;
    alreadyProcessedMessage?: string;
  } = {},
): string {
  const fallback = options.fallback ?? 'Не удалось закрыть счет. Изменения отменены.';
  const networkMessage =
    options.networkMessage ??
    'Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.';

  if (!(error instanceof Error)) {
    return fallback;
  }

  if (isNetworkFetchError(error)) {
    return networkMessage;
  }

  const message = error.message;
  if (
    message.includes('already completed') ||
    message.includes('already processed') ||
    message.includes('Payment is already completed') ||
    message.includes('already paid')
  ) {
    return options.alreadyProcessedMessage ?? 'Счет уже был обработан.';
  }

  return message || fallback;
}

export function mapReceiptUploadError(error: unknown): string {
  if (isNetworkFetchError(error)) {
    return 'Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Квитанция не была загружена.';
}
