type ProductLike = {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  unit: string;
  weightKg?: unknown;
  photoUrl?: string | null;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  compatibility?: string | null;
  specifications?: string | null;
  minSaleUnit?: string | null;
  isActive: boolean;
  category?: string | null;
  productCategory?: {
    id: string;
    code?: string | null;
    nameRu?: string | null;
    nameKy?: string | null;
    nameEn?: string | null;
  } | null;
  quantity?: number;
  lowStock?: boolean;
};

export function sanitizeBranchCeoProductRow(product: ProductLike) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    barcode: product.barcode ?? null,
    unit: product.unit,
    weightKg: product.weightKg !== undefined ? Number(product.weightKg) : null,
    photoUrl: product.photoUrl ?? null,
    description: product.description ?? null,
    brand: product.brand ?? product.category ?? null,
    isActive: product.isActive,
    category: product.productCategory?.nameRu ?? product.category ?? null,
    categoryId: product.productCategory?.id ?? null,
    quantity: product.quantity ?? 0,
    lowStock: product.lowStock ?? false,
  };
}

export function sanitizeBranchCeoProductDetail(product: ProductLike) {
  return sanitizeBranchCeoProductRow(product);
}
