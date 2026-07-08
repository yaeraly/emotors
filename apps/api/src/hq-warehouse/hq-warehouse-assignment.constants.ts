export const HQ_WAREHOUSE_ACCESS_DENIED = 'HQ_WAREHOUSE_ACCESS_DENIED';

export const HQ_WAREHOUSE_ACCESS_DENIED_MESSAGES = {
  ru: 'У вас нет доступа к этому складу.',
  ky: 'Бул складга кирүүгө укугуңуз жок.',
  en: 'You do not have permission to access this warehouse.',
} as const;

export const HQ_SALES_MANAGER_ACCESS_DENIED = 'HQ_SALES_MANAGER_ACCESS_DENIED';

export const HQ_SALES_MANAGER_ACCESS_DENIED_MESSAGES = {
  ru: 'У вас нет доступа к заявкам этого HQ склада.',
  ky: 'Бул HQ складдын заявкаларына кирүүгө укугуңуз жок.',
  en: 'You do not have access to requests for this HQ warehouse.',
} as const;
