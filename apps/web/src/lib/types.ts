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
  | 'HQ_ACCOUNTANT'
  | 'SALESPERSON'
  | 'FRANCHISE_OWNER'
  | 'WAREHOUSE_OPERATOR'
  | 'CASHIER'
  | 'ACADEMY_MANAGER'
  | 'MARKETING_MANAGER'
  | 'PROCUREMENT_MANAGER'
  | 'SUPPLY_CHAIN_MANAGER'
  | 'HQ_SALES_MANAGER'
  | 'HQ_CASHIER'
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
  | 'DRAFT'
  | 'DIAGNOSIS'
  | 'IN_REPAIR'
  | 'IN_PROGRESS'
  | 'WAITING_PARTS'
  | 'READY_FOR_PAYMENT'
  | 'PAID'
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
  | 'BALANCE'
  | 'MIXED';
export type InstallmentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
export type StockMovementType =
  | 'IN'
  | 'OUT'
  | 'TRANSFER'
  | 'ADJUSTMENT'
  | 'SALE'
  | 'SERVICE_USE'
  | 'INVENTORY_ADJUSTMENT_IN'
  | 'INVENTORY_ADJUSTMENT_OUT';

export type InventoryCountType =
  | 'FULL_WAREHOUSE'
  | 'CATEGORY'
  | 'SHELF'
  | 'ZONE'
  | 'PRODUCT';

export type InventoryCountStatus =
  | 'DRAFT'
  | 'COUNTING'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'ARCHIVED';

export type InventoryCountSummary = {
  totalProducts: number;
  countedProducts: number;
  remainingProducts: number;
  shortages: number;
  overages: number;
  matched: number;
  totalDifferenceValueKgs: number;
};

export type InventoryCountItem = {
  id: string;
  sessionId: string;
  productId: string;
  product?: Pick<Product, 'id' | 'sku' | 'barcode'>;
  sku: string;
  productName: string;
  categoryName: string;
  shelf?: string | null;
  zone?: string | null;
  systemQuantity: number;
  actualQuantity: number | null;
  differenceQuantity: number;
  unitCostKgs: number;
  differenceValueKgs: number;
  differenceType?: 'SHORTAGE' | 'OVERAGE' | 'MATCHED' | null;
  remark?: string | null;
  countedAt?: string | null;
};

export type InventoryCountSession = {
  id: string;
  sessionNumber: string;
  warehouseId: string;
  warehouse?: Warehouse;
  inventoryType: InventoryCountType;
  status: InventoryCountStatus;
  categoryId?: string | null;
  category?: ProductCategory | null;
  shelf?: string | null;
  zone?: string | null;
  filterCategoryId?: string | null;
  filterShelf?: string | null;
  filterZone?: string | null;
  filterBrand?: string | null;
  filterSupplierId?: string | null;
  filterProductIds?: string[] | null;
  notes?: string | null;
  createdById: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
  approvedById?: string | null;
  approvedBy?: Pick<User, 'id' | 'fullName' | 'role'> | null;
  rejectedById?: string | null;
  rejectedBy?: Pick<User, 'id' | 'fullName' | 'role'> | null;
  rejectionReason?: string | null;
  startDate?: string | null;
  finishDate?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  completedAt?: string | null;
  items?: InventoryCountItem[];
  summary?: InventoryCountSummary;
  createdAt: string;
  updatedAt: string;
};
export type SaleStatus =
  | 'DRAFT'
  | 'SENT_TO_CUSTOMER'
  | 'APPROVED_BY_CUSTOMER'
  | 'FINALIZED'
  | 'CANCELLED';
export type BranchDistributionOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ACCEPTED_BY_SUPPLY_CHAIN'
  | 'APPROVED'
  | 'INVOICED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'SENT_TO_WAREHOUSE'
  | 'PICKING'
  | 'PACKED'
  | 'SHIPPED'
  | 'SENT'
  | 'RECEIVED'
  | 'RECEIVED_BY_BRANCH'
  | 'RECEIVED_WITH_DIFFERENCE'
  | 'COMPLETED'
  | 'CLOSED'
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

export type BranchType = 'HQ_BRANCH' | 'FRANCHISE' | 'DEALER' | 'DISTRIBUTOR';

export type Branch = {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  ownerName?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SUSPENDED';
  branchType?: BranchType;
  hqToBranchMarkupPercent?: number;
  priceProfile?: {
    id: string;
    name: string;
    code?: string;
    profileType?: string;
  } | null;
  openedAt?: string | null;
  assignedHqWarehouseId?: string | null;
  assignedHqWarehouse?: {
    id: string;
    name: string;
    code: string;
    city?: string | null;
    isActive?: boolean;
    hqManagerAssignments?: Array<{
      user?: { id: string; fullName: string };
    }>;
  } | null;
  updatedAt?: string;
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
  hasLogin?: boolean;
  department?: string | null;
  notes?: string | null;
  salary?: number | string | null;
  startDate?: string | null;
  permissions?: string[];
  additionalPermissions?: string[];
  cashierCapability?: boolean;
  assignedHqWarehouseIds?: string[];
  assignedHqWarehouses?: Array<Pick<Warehouse, 'id' | 'name' | 'code' | 'city'>>;
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
  vehicle?: string | null;
  licensePlate?: string | null;
  mileage?: number | null;
  complaint?: string | null;
  repairDescription?: string | null;
  diagnosisResult?: string | null;
  laborCost: number;
  partsCost: number;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  warrantyDays?: number | null;
  warrantyUntil?: string | null;
  notes?: string | null;
  oldPartReturned?: boolean;
  customerSignature?: string | null;
  checklistDiagnostics?: boolean;
  checklistPartsInstalled?: boolean;
  checklistTestDrive?: boolean;
  checklistFinalInspection?: boolean;
  checklistCustomerInformed?: boolean;
  diagnoses?: Diagnosis[];
  repairs?: Repair[];
  parts?: PartsConsumption[];
  partsRequests?: PartsRequest[];
  photos?: ServiceOrderPhoto[];
  payments?: ServiceOrderPayment[];
  warranties?: Warranty[];
  receipt?: ServiceReceipt;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  readyForPaymentAt?: string | null;
  paidAt?: string | null;
};

export type PartsRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ISSUED'
  | 'PARTIALLY_ISSUED'
  | 'WAITING_STOCK'
  | 'REJECTED'
  | 'PENDING'
  | 'APPROVED'
  | 'RELEASED'
  | 'CANCELLED';

export type PartsRequest = {
  id: string;
  requestNumber: string;
  serviceOrderId: string;
  branchId: string;
  status: PartsRequestStatus;
  note?: string | null;
  items: PartsRequestItem[];
  serviceOrder?: ServiceOrder;
  createdAt: string;
};

export type PartsRequestItem = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  issuedQuantity: number;
  unitPrice?: number | null;
  notes?: string | null;
};

export type ServiceOrderPhoto = {
  id: string;
  type: 'BEFORE' | 'AFTER' | 'DAMAGED_PART';
  fileName: string;
  fileUrl: string;
  mimeType: string;
  createdAt: string;
};

export type ServiceOrderPayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note?: string | null;
};

export type ServiceReceipt = {
  orderNumber: string;
  laborLines: Array<{ description: string; amount: number }>;
  partsLines: Array<{ description: string; amount: number; quantity: number }>;
  laborTotal: number;
  partsTotal: number;
  total: number;
  paidAmount: number;
  debtAmount: number;
  text: string;
};

export type ServiceCustomerOption = {
  id: string;
  fullName: string;
  phone: string;
  customerCode: string;
  vipStatus: boolean;
  status: CustomerStatus;
  outstandingDebt: number;
  lastVisit?: string | null;
};

export type ServiceProductOption = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  category?: string | null;
  unitPrice: number;
  unit: string;
};

export type ServiceHistoryEntry = {
  id: string;
  date: string;
  vehicle?: string | null;
  licensePlate?: string | null;
  complaint?: string | null;
  diagnosis?: string | null;
  repair?: string | null;
  partsUsed: Array<{ name?: string; quantity: number; totalPrice: number }>;
  laborCost: number;
  total: number;
  warrantyUntil?: string | null;
  warrantyStatus: WarrantyStatus;
};

export type MasterKpi = {
  masterId: string;
  completedRepairs: number;
  laborRevenue: number;
  averageRepairTimeHours: number;
  warrantyReturns: number;
  partsUsed: number;
  customerRating: number | null;
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
  branchId: string | null;
  warehouseType?: 'HQ' | 'BRANCH';
  name: string;
  code: string;
  address?: string | null;
  country?: string;
  city?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  notes?: string | null;
  isActive: boolean;
  managers?: Array<{ id: string; fullName: string }>;
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
  barcode?: string | null;
  category: string;
  photoUrl?: string | null;
  description?: string | null;
  characteristics?: unknown;
  unit?: string;
  defaultSupplierId?: string | null;
  defaultFactoryId?: string | null;
  defaultSupplier?: { id: string; name: string } | null;
  defaultFactory?: { id: string; name: string } | null;
  weightKg: number;
  purchasePriceYuan: number;
  purchasePriceUpdatedAt?: string | null;
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
  purchasePriceHistory?: ProductPurchasePriceHistory[];
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

export type PurchasePriceChangeReason =
  | 'SUPPLIER_PRICE_CHANGE'
  | 'NEW_PROCUREMENT'
  | 'FACTORY_PRICE_UPDATE'
  | 'MANUAL_CORRECTION';

export type ProductPurchasePriceHistory = {
  id: string;
  productId: string;
  product?: { id: string; name: string; sku: string };
  supplierId?: string | null;
  supplier?: { id: string; name: string } | null;
  factoryId?: string | null;
  factory?: { id: string; name: string } | null;
  oldPriceYuan: number;
  newPriceYuan: number;
  differenceYuan: number;
  effectiveDate: string;
  reason: PurchasePriceChangeReason;
  note?: string | null;
  procurementOrderId?: string | null;
  procurementOrder?: { id: string; orderNumber: string } | null;
  changedBy?: { id: string; fullName: string; role: string };
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

export type DistributionShipmentWeightSummary = {
  lineCount: number;
  totalQuantity: number;
  totalWeightKg: number;
  unit: string;
  hasSnapshot?: boolean;
  weightSnapshotAt?: string | null;
};

export type DistributionDeliveryCostSummary = {
  transportCostKgs: number;
  totalShipmentWeightKg: number;
  costPerKg: number;
  productCostTotal: number;
  deliveryCostTotal: number;
  landedCostTotal: number;
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
  transportExpenseAllocation?: number;
  transportCostPerUnit?: number;
  landedUnitCostKgs?: number;
  transferCostKgs?: number;
  deliveryCostKgs?: number;
  totalLandedCostKgs?: number;
  dispatchedQuantity?: number;
  unitWeightKg?: number;
  lineWeightKg?: number;
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
  transportCompany?: string | null;
  transportCostKgs?: number;
  driverName?: string | null;
  vehicleNumber?: string | null;
  transportNotes?: string | null;
  totalShipmentWeightKg?: number;
  deliveryCostEnteredAt?: string | null;
  deliveryCostEnteredById?: string | null;
  deliveryCostSummary?: DistributionDeliveryCostSummary;
  shipmentWeightSummary?: DistributionShipmentWeightSummary;
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
  receiptReference?: string | null;
  confirmationStatus?: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'REJECTED';
  paidAt: string;
  createdById: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
  createdAt: string;
  updatedAt: string;
};

export type BranchOrderInstallment = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  totalAmount: number;
  firstPaymentAmount: number;
  termMonths: number;
  firstPaymentRequired: boolean;
  firstPaymentConfirmed: boolean;
};

export type BranchInvoicePaymentType = 'FULL_PAYMENT' | 'INSTALLMENT';

export type AccountantInvoiceWorkflowStatus =
  | 'PENDING_ACCOUNTANT_REVIEW'
  | 'INSTALLMENT_APPROVAL_PENDING'
  | 'READY_FOR_CASHIER'
  | 'WAITING_FOR_PAYMENT'
  | 'PAYMENT_SUBMITTED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'REJECTED'
  | 'CANCELLED';

export type BranchAccountantInvoice = {
  id: string;
  invoiceNumber: string;
  branchId: string;
  branch?: Pick<Branch, 'id' | 'name' | 'code'> | null;
  distributionOrderId: string;
  orderNumber?: string | null;
  branchPurchaseRequestId?: string | null;
  branchPurchaseRequestNumber?: string | null;
  workflowStatus: AccountantInvoiceWorkflowStatus;
  paymentType?: BranchInvoicePaymentType | null;
  status: BranchInvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  remainingAmount: number;
  requiredPaymentAmount: number;
  dueDate: string;
  issuedAt: string;
  sentToBranchAt?: string | null;
  sentToCashierAt?: string | null;
  itemCount: number;
  items: Array<{
    id: string;
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    unit?: string | null;
  }>;
  branchOrderInstallment?: BranchOrderInstallment | null;
  payments?: BranchPayment[];
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
  goodsReceivingId?: string | null;
  goodsReceiving?: GoodsReceiving | null;
  status: BranchInvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  dueDate: string;
  issuedAt: string;
  sentToBranchAt?: string | null;
  sentToCashierAt?: string | null;
  createdById: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
  payments?: BranchPayment[];
  branchOrderInstallment?: BranchOrderInstallment | null;
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
  transportExpenseAllocation?: number | string;
  transportCostPerUnit?: number | string;
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
  transportCompany?: string | null;
  transportCostKgs?: number;
  driverName?: string | null;
  vehicleNumber?: string | null;
  arrivalDate?: string | null;
  transportNotes?: string | null;
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
  cashReceived?: number | null;
  changeAmount?: number | null;
  paidAt: string;
  note?: string | null;
  status?: PaymentRecordStatus;
  voidedAt?: string | null;
  createdById: string;
  createdAt: string;
  createdBy?: Pick<User, 'id' | 'fullName' | 'role'>;
};

export type SaleInstallmentApprovalStatus =
  | 'DRAFT'
  | 'PENDING_BRANCH_CEO_APPROVAL'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'ACTIVE'
  | 'PAID'
  | 'CANCELLED';

export type SaleInstallmentPayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  paidAfterTotal: number;
  remainingAfter: number;
  createdAt: string;
  createdBy?: Pick<User, 'id' | 'fullName'>;
};

export type SaleInstallmentApproval = {
  id: string;
  saleId: string;
  branchId: string;
  requestNumber: string;
  installmentNumber?: string;
  status: SaleInstallmentApprovalStatus;
  requestVersion: number;
  totalAmount: number;
  initialPayment: number;
  downPayment?: number;
  financedAmount: number;
  installmentPaidAmount?: number;
  paidAmount?: number;
  remainingDebt?: number;
  installmentDays?: number | null;
  dueDate?: string | null;
  paymentCount: number;
  notes?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  submittedBy?: Pick<User, 'id' | 'fullName' | 'role'> | null;
  approvedBy?: Pick<User, 'id' | 'fullName' | 'role'> | null;
  rejectedBy?: Pick<User, 'id' | 'fullName' | 'role'> | null;
  paymentHistory?: SaleInstallmentPayment[];
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
  installmentApproval?: SaleInstallmentApproval | null;
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

export type FinanceAccountScope = 'HQ' | 'BRANCH';
export type FinanceAccountStatus = 'ACTIVE' | 'INACTIVE';
export type FinanceTransferStatus =
  | 'DRAFT'
  | 'PENDING_CASHIER'
  | 'PENDING'
  | 'RETURNED'
  | 'APPROVED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';
export type CashierShiftStatus = 'OPEN' | 'CLOSED';

export type FinanceAccountTypeDefinition = {
  id: string;
  code: string;
  name: string;
  category?: string | null;
};

export type FinanceAccount = {
  id: string;
  accountNumber: string;
  name: string;
  scope: FinanceAccountScope;
  branchId?: string | null;
  typeCode: string;
  currency: string;
  status: FinanceAccountStatus;
  openingBalance: number;
  currentBalance: number;
  availableBalance: number;
  pendingBalance: number;
  bankName?: string | null;
  bankAccountNo?: string | null;
  qrProvider?: string | null;
  qrMerchantId?: string | null;
  posTerminalId?: string | null;
  notes?: string | null;
  typeDefinition?: FinanceAccountTypeDefinition;
  branch?: { id: string; name: string; code: string } | null;
  assignments?: Array<{
    id: string;
    isPrimary?: boolean;
    allowedOperations?: string[];
    user: { id: string; fullName: string; email: string; role: Role };
  }>;
};

export type FinanceTransferAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  entityType: string;
  mimeType?: string | null;
  createdAt?: string;
};

export type FinanceTransfer = {
  id: string;
  transferNumber: string;
  amount: number;
  currency: string;
  transferDate: string;
  status: FinanceTransferStatus;
  reason?: string | null;
  notes?: string | null;
  transactionNumber?: string | null;
  version?: number;
  returnReason?: string | null;
  sentToCashierAt?: string | null;
  completedAt?: string | null;
  sourceAccount: FinanceAccount;
  destinationAccount: FinanceAccount;
  accountant?: { id: string; fullName: string; role?: Role } | null;
  cashier?: { id: string; fullName: string; role?: Role } | null;
  createdBy?: { id: string; fullName: string; role?: Role } | null;
  receipts?: FinanceTransferAttachment[];
  supportDocuments?: FinanceTransferAttachment[];
  attachments?: FinanceTransferAttachment[];
};

export type FinanceLedgerEntry = {
  id: string;
  entryNumber: string;
  entryType: string;
  amount: number;
  signedAmount: number;
  beforeBalance: number;
  afterBalance: number;
  currency: string;
  createdAt: string;
  account?: { id: string; name: string; accountNumber: string };
  createdBy?: { id: string; fullName: string } | null;
};

export type FinanceInvestment = {
  id: string;
  investmentNumber: string;
  investmentDate: string;
  investmentType: 'OWNER_INVESTMENT' | 'INVESTOR_INVESTMENT';
  amount: number;
  currency: string;
  investorOwnerName: string;
  providedBy: string;
  notes?: string | null;
  createdAt: string;
  account?: { id: string; name: string; accountNumber: string; branchId?: string | null };
  createdBy?: { id: string; fullName: string; email: string } | null;
  ledgerEntry?: { id: string; entryNumber: string; entryType: string; beforeBalance?: number; afterBalance?: number };
};

export type CashierShift = {
  id: string;
  shiftNumber: string;
  status: CashierShiftStatus;
  openingBalance: number;
  expectedBalance: number;
  actualBalance?: number | null;
  closingBalance?: number | null;
  difference?: number | null;
  comments?: string | null;
  openedAt: string;
  closedAt?: string | null;
  account: { id: string; name: string; accountNumber: string; currentBalance: number; currency: string };
  cashier: { id: string; fullName: string; email: string };
};

export type FinanceSummaryReport = {
  accounts: FinanceAccount[];
  branchSummaries: Array<{
    branchId: string;
    branchName: string;
    branchCode: string;
    accountCount: number;
    totalBalance: number;
  }>;
  totals: {
    balance: number;
    income: number;
    expenses: number;
    profit: number;
    transfersExcluded: boolean;
  };
};

export type FinanceAuditEntry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
  user?: { id: string; fullName: string; email: string } | null;
};

