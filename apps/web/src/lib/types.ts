export type Role = 'OWNER' | 'MANAGER' | 'MASTER' | 'ACCOUNTANT';

export type CustomerStatus = 'NEW' | 'ACTIVE' | 'VIP' | 'SLEEPING' | 'RISK';

export type CustomerEventType =
  | 'NOTE'
  | 'CALL'
  | 'WHATSAPP'
  | 'VISIT'
  | 'SALE'
  | 'SERVICE'
  | 'FOLLOW_UP';

export type FollowUpStatus = 'OPEN' | 'DONE' | 'CANCELLED';

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
  totalPurchaseAmount: string;
  totalProfitAmount: string;
  totalDebtAmount: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
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
    };
