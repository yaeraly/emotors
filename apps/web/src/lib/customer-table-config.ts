import type { User } from '@/lib/types';
import { isBranchOwnerUser, isBranchSalesManagerUser } from '@/lib/rbac';

export type CustomerListColumnKey =
  | 'fullName'
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

const branchScopedColumns: CustomerListColumnKey[] = [
  'fullName',
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
  if (isBranchOwnerUser(user) || isBranchSalesManagerUser(user)) {
    return branchScopedColumns;
  }
  return hqColumns;
}

export function shouldShowCustomerListEditButton(
  user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined,
) {
  return !isBranchSalesManagerUser(user);
}
