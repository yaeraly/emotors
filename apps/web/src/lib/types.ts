export type Role = 'OWNER' | 'MANAGER' | 'MASTER' | 'ACCOUNTANT';

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
  | 'CARD'
  | 'TRANSFER'
  | 'MBANK'
  | 'ELCART'
  | 'BALANCE';
export type InstallmentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export type Branch = {
  id: string;
  name: string;
  code: string;
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
  notes?: string | null;
  items?: SaleItem[];
  payments?: Payment[];
  installments?: InstallmentSchedule[];
  receipt?: Receipt | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
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
