export class PurchaseAssistantQueryDto {
  periodDays?: number | string;
  reserveDays?: number | string;
}

export class PurchaseAssistantActionItemDto {
  productId!: string;
  recommendedQuantity!: number;
  finalQuantity!: number;
  reason?: string;
  periodDays!: number;
  reserveDays!: number;
  hqStock!: number;
  onTheWay!: number;
  branchOrders!: number;
  salesQuantity!: number;
}

export class PurchaseAssistantAcceptDto {
  items!: PurchaseAssistantActionItemDto[];
}

export class PurchaseAssistantModifyDto {
  item!: PurchaseAssistantActionItemDto;
}
