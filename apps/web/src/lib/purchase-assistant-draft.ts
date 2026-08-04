export const PURCHASE_ASSISTANT_DRAFT_KEY = 'emotors_purchase_assistant_draft';

export type PurchaseAssistantDraftItem = {
  productId: string;
  quantity: number;
  purchasePriceYuan?: number;
  factoryId?: string | null;
  name?: string;
  sku?: string;
  recommendedQuantity?: number;
  reason?: string;
};

export type PurchaseAssistantDraft = {
  source: 'purchase-assistant';
  createdAt: string;
  items: PurchaseAssistantDraftItem[];
};

function getSessionStorage(): Storage | null {
  try {
    const storage =
      (typeof globalThis !== 'undefined' && (globalThis as { sessionStorage?: Storage }).sessionStorage) ||
      (typeof window !== 'undefined' ? window.sessionStorage : null);
    return storage ?? null;
  } catch {
    return null;
  }
}

export function savePurchaseAssistantDraft(items: PurchaseAssistantDraftItem[]) {
  const storage = getSessionStorage();
  if (!storage) return;
  const draft: PurchaseAssistantDraft = {
    source: 'purchase-assistant',
    createdAt: new Date().toISOString(),
    items: items
      .filter((item) => item.productId && Number(item.quantity) > 0)
      .map((item) => ({
        productId: item.productId,
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 0)),
        purchasePriceYuan: item.purchasePriceYuan,
        factoryId: item.factoryId ?? null,
        name: item.name,
        sku: item.sku,
        recommendedQuantity: item.recommendedQuantity,
        reason: item.reason,
      })),
  };
  storage.setItem(PURCHASE_ASSISTANT_DRAFT_KEY, JSON.stringify(draft));
}

export function consumePurchaseAssistantDraft(): PurchaseAssistantDraft | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  const raw = storage.getItem(PURCHASE_ASSISTANT_DRAFT_KEY);
  if (!raw) return null;
  storage.removeItem(PURCHASE_ASSISTANT_DRAFT_KEY);
  try {
    const parsed = JSON.parse(raw) as PurchaseAssistantDraft;
    if (!parsed || parsed.source !== 'purchase-assistant' || !Array.isArray(parsed.items)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
