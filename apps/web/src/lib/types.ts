export type Role =
  | 'OWNER'
  | 'CEO'
  | 'FRANCHISE_DIRECTOR'
  | 'FINANCE_MANAGER'
  | 'WAREHOUSE_MANAGER'
  | 'CONTENT_CREATOR'
  | 'ACADEMY_DIRECTOR'
  | 'SYSTEM_ADMINISTRATOR'
  | 'MANAGER'
  | 'MASTER'
  | 'ACCOUNTANT'
  | 'SALESPERSON'
  | 'FRANCHISE_OWNER'
  | 'WAREHOUSE_OPERATOR'
  | 'CASHIER'
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
  | 'INACTIVE'
  | 'ARCHIVED';

export type CustomerEventType =
  | 'NOTE'
  | 'CALL'
  | 'WHATSAPP'
  | 'VISIT'
  | 'SALE'
  | 'SERVICE'
  | 'FOLLOW_UP';

export type FollowUpStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type ServiceOrderStatus =
  | 'NEW'
  | 'DIAGNOSIS'
  | 'IN_REPAIR'
  | 'WAITING_PARTS'
  | 'COMPLETED'
  | 'CANCELLED';
export type RepairStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type WarrantyStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'DEBT';
export type PaymentRecordStatus = 'ACTIVE' | 'VOID';
export type StockMovementStatus = 'ACTIVE' | 'VOID';
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
export type BranchDistributionOrderStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'SENT'
  | 'RECEIVED'
  | 'RECEIVED_WITH_DIFFERENCE'
  | 'CANCELLED';
export type GoodsReceivingStatus = 'DRAFT' | 'COMPLETED' | 'CANCELLED';
export type ShortageReportStatus = 'OPEN' | 'RESOLVED' | 'CANCELLED';
export type ShortageReportItemType = 'SHORTAGE' | 'OVERAGE';
export type BranchInvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';
export type BranchPaymentMethod =
  | 'CASH'
  | 'QR'
  | 'BANK'
  | 'TRANSFER'
  | 'INSTALLMENT'
  | 'BALANCE';

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
  deletedAt?: string | null;
};

export type User = {
  id: string;
  email: string;
  employeeId?: string | null;
  phone?: string | null;
  username?: string | null;
  fullName: string;
  role: Role;
  roles?: Role[];
  branchId: string | null;
  branch?: Branch | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  mustChangePassword?: boolean;
  permissions?: string[];
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
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

export type ServiceOrder = {
  id: string;
  orderNumber: string;
  branchId: string;
  branch?: Branch;
  customerId: string;
  customer?: Customer;
  masterId: string;
  master?: Pick<User, 'id' | 'fullName' | 'role'>;
  status: ServiceOrderStatus;
  problemDescription: string;
  diagnosisResult?: string | null;
  laborCost: number;
  partsCost: number;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  warrantyUntil?: string | null;
  diagnoses?: Diagnosis[];
  repairs?: Repair[];
  parts?: PartsConsumption[];
  warranties?: Warranty[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
};

export type Diagnosis = {
  id: string;
  problem: string;
  result: string;
  recommendedRepair?: string | null;
  diagnosisFee: number;
  createdAt: string;
};

export type Repair = {
  id: string;
  description: string;
  laborCost: number;
  status: RepairStatus;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type PartsConsumption = {
  id: string;
  productId: string;
  product?: Product;
  warehouseId: string;
  warehouse?: Warehouse;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
  createdAt: string;
};

export type Warranty = {
  id: string;
  serviceOrderId: string;
  serviceOrder?: ServiceOrder;
  customerId: string;
  customer?: Customer;
  productId?: string | null;
  product?: Product | null;
  branchId: string;
  branch?: Branch;
  warrantyNumber: string;
  startsAt: string;
  expiresAt: string;
  status: WarrantyStatus;
  note?: string | null;
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
  status?: StockMovementStatus;
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

export type BranchDistributionOrderItem = {
  id: string;
  orderId: string;
  productId: string;
  product?: Product;
  sku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
  profit: number;
  createdAt: string;
  updatedAt: string;
};

export type BranchDistributionOrder = {
  id: string;
  orderNumber: string;
  branchId: string;
  branch?: Branch;
  sourceWarehouseId: string;
  sourceWarehouse?: Warehouse;
  destinationWarehouseId: string;
  destinationWarehouse?: Warehouse;
  status: BranchDistributionOrderStatus;
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  note?: string | null;
  createdById: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
  approvedById?: string | null;
  approvedBy?: Pick<User, 'id' | 'fullName' | 'role'> | null;
  approvedAt?: string | null;
  sentAt?: string | null;
  cancelledAt?: string | null;
  items?: BranchDistributionOrderItem[];
  branchInvoice?: BranchInvoice | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type BranchPayment = {
  id: string;
  branchId: string;
  invoiceId: string;
  amount: number;
  method: BranchPaymentMethod;
  note?: string | null;
  paidAt: string;
  createdById: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
  createdAt: string;
  updatedAt: string;
};

export type BranchInvoice = {
  id: string;
  invoiceNumber: string;
  branchId: string;
  branch?: Branch;
  distributionOrderId: string;
  distributionOrder?: BranchDistributionOrder;
  goodsReceivingId: string;
  goodsReceiving?: GoodsReceiving;
  status: BranchInvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  dueDate: string;
  issuedAt: string;
  createdById: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
  payments?: BranchPayment[];
  createdAt: string;
  updatedAt: string;
};

export type BranchAccountBalance = {
  id?: string;
  branchId: string;
  branch?: Branch;
  totalDebt: number;
  totalPaid: number;
  lastPaymentAt?: string | null;
};

export type GoodsReceivingItem = {
  id: string;
  receivingId: string;
  distributionOrderItemId: string;
  productId: string;
  sku: string;
  productName: string;
  sentQuantity: number;
  receivedQuantity: number;
  differenceQuantity: number;
  unitCost: number | string;
  unitPrice: number | string;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GoodsReceiving = {
  id: string;
  receivingNumber: string;
  distributionOrderId: string;
  distributionOrder?: BranchDistributionOrder;
  branchId: string;
  branch?: Branch;
  warehouseId: string;
  warehouse?: Warehouse;
  status: GoodsReceivingStatus;
  receivedById: string;
  receivedBy?: Pick<User, 'id' | 'fullName' | 'role'>;
  receivedAt: string;
  note?: string | null;
  items?: GoodsReceivingItem[];
  shortageReport?: ShortageReport | null;
  branchInvoice?: BranchInvoice | null;
  createdAt: string;
  updatedAt: string;
};

export type ShortageReportItem = {
  id: string;
  shortageReportId: string;
  productId: string;
  sku: string;
  productName: string;
  expectedQuantity: number;
  receivedQuantity: number;
  differenceQuantity: number;
  type: ShortageReportItemType;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShortageReport = {
  id: string;
  reportNumber: string;
  goodsReceivingId: string;
  goodsReceiving?: GoodsReceiving;
  distributionOrderId: string;
  distributionOrder?: BranchDistributionOrder;
  branchId: string;
  branch?: Branch;
  warehouseId: string;
  warehouse?: Warehouse;
  status: ShortageReportStatus;
  createdById: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
  items?: ShortageReportItem[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
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
  status?: PaymentRecordStatus;
  voidedAt?: string | null;
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
