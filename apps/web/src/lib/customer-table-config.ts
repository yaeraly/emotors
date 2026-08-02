import type { User } from '@/lib/types';
import { canEditCustomer, isBranchOwnerUser, isBranchSalesManagerUser } from '@/lib/rbac';

export type CustomerListColumnKey =
  | 'fullName'
  | 'customerType'
  | 'phone'
  | 'whatsappPhone'
  | 'branch'
  | 'status'
  | 'totalPurchases'
  | 'totalProfit'
  | 'totalDebt'
  | 'purchaseHistory'
  | 'createdAt'
  | 'actions';

const hqColumns: CustomerListColumnKey[] = [
  'fullName',
  'phone',
  'whatsappPhone',
  'branch',
  'status',
  'totalPurchases',
  'totalProfit',
  'totalDebt',
  'purchaseHistory',
  'createdAt',
  'actions',
];

const branchSalesColumns: CustomerListColumnKey[] = [
  'fullName',
  'customerType',
  'status',
  'totalPurchases',
  'totalDebt',
  'createdAt',
  'actions',
];

const branchOwnerColumns: CustomerListColumnKey[] = [
  'fullName',
  'customerType',
  'status',
  'totalPurchases',
  'totalProfit',
  'totalDebt',
  'createdAt',
  'actions',
];

export function getCustomerListColumns(
  user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined,
): CustomerListColumnKey[] {
  if (isBranchSalesManagerUser(user)) {
    return branchSalesColumns;
  }
  if (isBranchOwnerUser(user)) {
    return branchOwnerColumns;
  }
  return hqColumns;
}

export function shouldShowCustomerListEditButton(
  user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined,
) {
  return canEditCustomer(user);
}
