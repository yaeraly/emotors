export type Role =
  | 'OWNER'
  | 'MANAGER'
  | 'MASTER'
  | 'ACCOUNTANT'
  | 'ACADEMY_MANAGER'
  | 'MARKETING_MANAGER'
  | 'PROCUREMENT_MANAGER'
  | 'SUPPLY_CHAIN_MANAGER'
  | 'INVESTMENT_MANAGER'
  | 'EXPANSION_MANAGER';

export type CustomerStatus =
  | 'NEW'
  | 'ACTIVE'
  | 'VIP'
  | 'SLEEPING'
  | 'RISK'
  | 'INACTIVE';

export type CustomerEventType =
  | 'NOTE'
  | 'CALL'
  | 'WHATSAPP'
  | 'VISIT'
  | 'SALE'
  | 'SERVICE'
  | 'FOLLOW_UP';

export type FollowUpStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'DEBT';
export type PaymentMethod =
  | 'CASH'
  | 'QR'
  | 'CARD'
  | 'BANK_TRANSFER'
  | 'MBANK'
  | 'ELCART'
  | 'BALANCE';
export type InstallmentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
export type StockMovementType =
  | 'IN'
  | 'OUT'
  | 'TRANSFER'
  | 'ADJUSTMENT'
  | 'SALE'
  | 'SERVICE_USE';
export type SaleStatus =
  | 'DRAFT'
  | 'SENT_TO_CUSTOMER'
  | 'APPROVED_BY_CUSTOMER'
  | 'FINALIZED'
  | 'CANCELLED';

export type Branch = {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  ownerName?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SUSPENDED';
  openedAt?: string | null;
};

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  branchId: string;
  branch?: Branch;
};

export type Customer = {
  id: string;
  fullName: string;
  phone: string;
  whatsappPhone?: string | null;
  branchId: string;
  branch?: Branch;
  status: CustomerStatus;
  notes?: string | null;
  totalPurchases: number;
  totalProfit: number;
  totalDebt: number;
  totalPayments?: number;
  averageOrderValue?: number;
  purchaseCount: number;
  lastPurchaseDate?: string | null;
  totalPurchaseAmount: number | string;
  totalProfitAmount: number | string;
  totalDebtAmount: number | string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type PurchaseHistoryRow = {
  id: string;
  date: string;
  invoiceNumber: string;
  products: string;
  quantity: number | null;
  totalAmount: number | null;
  profit: number | null;
  paymentStatus: string;
};

export type ServiceHistory = {
  diagnostics: Array<{
    id: string;
    date: string;
    description: string;
  }>;
  repairs: Array<{
    id: string;
    date: string;
    description: string;
  }>;
  warrantyRecords: Array<{
    id: string;
    date: string;
    description: string;
  }>;
};

export type CustomerEvent = {
  id: string;
  customerId: string;
  branchId: string;
  type: CustomerEventType;
  message: string;
  createdById: string;
  createdAt: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
};

export type FollowUp = {
  id: string;
  customerId: string;
  branchId: string;
  title: string;
  description?: string | null;
  dueAt: string;
  status: FollowUpStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
};

export type SaleItem = {
  id: string;
  saleId: string;
  productId?: string | null;
  productName: string;
  productSku?: string | null;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  totalPrice: number;
  totalCost: number;
  profitAmount: number;
  createdAt: string;
};

export type Warehouse = {
  id: string;
  branchId: string;
  name: string;
  code: string;
  address?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  branchId: string;
  warehouseId: string;
  warehouse?: Warehouse;
  categoryId: string;
  productCategory?: ProductCategory;
  name: string;
  sku: string;
  category: string;
  photoUrl?: string | null;
  description?: string | null;
  characteristics?: unknown;
  weightKg: number;
  purchasePriceYuan: number;
  latestYuanRate: number;
  purchaseCostKgs: number;
  transportCostKgs: number;
  finalCostKgs: number;
  sellingPriceKgs: number;
  marginAmount: number;
  marginPercent: number;
  minStockLevel: number;
  quantity: number;
  lowStock: boolean;
  isActive: boolean;
  priceHistory?: ProductPriceHistory[];
  stockMovements?: StockMovement[];
  inventoryBalances?: InventoryBalance[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type ProductListResponse = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};

export type ProductPriceHistory = {
  id: string;
  productId: string;
  purchasePriceYuan: number | string;
  yuanRate: number | string;
  purchaseCostKgs: number | string;
  transportCostKgs: number | string;
  finalCostKgs: number | string;
  sellingPriceKgs: number | string;
  marginAmount: number | string;
  marginPercent: number | string;
  effectiveFrom: string;
  createdAt: string;
};

export type YuanRateHistory = {
  id: string;
  rate: number | string;
  effectiveFrom: string;
  createdAt: string;
};

export type StockMovement = {
  id: string;
  branchId: string;
  warehouseId: string;
  warehouse?: Warehouse;
  productId: string;
  product?: Product;
  type: StockMovementType;
  quantity: number;
  unitCostKgs: number | string;
  totalCostKgs: number | string;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt: string;
};

export type InventoryBalance = {
  id: string;
  branchId: string;
  warehouseId: string;
  warehouse: Warehouse;
  productId: string;
  product: Product;
  sku: string;
  quantity: number;
  averageCostKgs: number;
  totalValueKgs: number;
  minStockLevel: number;
  lowStock: boolean;
  updatedAt: string;
};

export type StockValueReport = {
  totalQuantity: number;
  totalStockValueKgs: number;
  byWarehouse: Array<{ name: string; quantity: number; totalStockValueKgs: number }>;
  byCategory: Array<{ name: string; quantity: number; totalStockValueKgs: number }>;
};

export type ProductCategory = {
  id: string;
  code: string;
  nameKy: string;
  nameRu: string;
  nameEn: string;
  description?: string | null;
  isActive: boolean;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type Payment = {
  id: string;
  branchId: string;
  saleId: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note?: string | null;
  createdById: string;
  createdAt: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
};

export type InstallmentSchedule = {
  id: string;
  branchId: string;
  saleId: string;
  customerId: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: InstallmentStatus;
  createdAt: string;
  updatedAt: string;
};

export type Receipt = {
  id: string;
  branchId: string;
  saleId: string;
  receiptNumber: string;
  qrCodeData: string;
  printedAt?: string | null;
  createdAt: string;
};

export type Sale = {
  id: string;
  branchId: string;
  branch?: Branch;
  customerId: string;
  customer: Customer;
  sellerId: string;
  seller?: Pick<User, 'id' | 'fullName' | 'email' | 'role'>;
  receiptNumber: string;
  saleDate: string;
  totalAmount: number;
  totalCost: number;
  profitAmount: number;
  paidAmount: number;
  debtAmount: number;
  paymentStatus: PaymentStatus;
  status: SaleStatus;
  draftReceiptText?: string | null;
  whatsappMessageText?: string | null;
  sentToCustomerAt?: string | null;
  approvedAt?: string | null;
  finalizedAt?: string | null;
  cancelledAt?: string | null;
  notes?: string | null;
  items?: SaleItem[];
  payments?: Payment[];
  installments?: InstallmentSchedule[];
  receipt?: Receipt | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type WhatsAppDraftResponse = {
  sale: Sale;
  whatsappLink: string;
  whatsappMessageText: string;
};

export type DailySalesReport = {
  totalSalesAmount: number;
  totalPaidAmount: number;
  totalDebtAmount: number;
  totalProfitAmount: number;
  saleCount: number;
  cashPayments: number;
  transferPayments: number;
  cardPayments: number;
};

export type TimelineEntry =
  | {
      kind: 'event';
      at: string;
      item: CustomerEvent;
    }
  | {
      kind: 'followUp';
      at: string;
      item: FollowUp;
    }
  | {
      kind: 'sale';
      at: string;
      item: Sale;
    }
  | {
      kind: 'payment';
      at: string;
      item: Payment & {
        receiptNumber: string;
      };
    };
