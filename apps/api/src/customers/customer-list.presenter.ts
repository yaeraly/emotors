import type { AuthUser } from '../auth/auth.types';
import { hasAnyHqRole, isBranchOwnerUser, isBranchSalesManagerUser } from '../rbac/rbac';

type CustomerListBase = {
  id: string;
  fullName: string;
  phone: string;
  whatsappPhone: string | null;
  status: string;
  branchId: string;
  branch: { id: string; name: string; code: string };
  totalPurchases: number;
  totalProfit: number;
  totalDebt: number;
  purchaseCount: number;
  lastPurchaseDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  totalPurchaseAmount: number;
  totalProfitAmount: number;
  totalDebtAmount: number;
};

export function toRoleAwareCustomerListItem(user: AuthUser, customer: CustomerListBase) {
  if (isBranchSalesManagerUser(user) || isBranchOwnerUser(user)) {
    return {
      id: customer.id,
      fullName: customer.fullName,
      status: customer.status,
      totalPurchases: customer.totalPurchases,
      totalProfit: customer.totalProfit,
      totalDebt: customer.totalDebt,
      lastPurchaseDate: customer.lastPurchaseDate,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      totalPurchaseAmount: customer.totalPurchaseAmount,
      totalProfitAmount: customer.totalProfitAmount,
      totalDebtAmount: customer.totalDebtAmount,
    };
  }

  if (hasAnyHqRole(user.roles?.length ? user.roles : [user.role])) {
    return customer;
  }

  return customer;
}
