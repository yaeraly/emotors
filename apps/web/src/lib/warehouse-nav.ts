import type { User } from '@/lib/types';
import {
  canViewBranchWarehouses,
  canViewHqWarehouse,
  canViewInventoryCount,
  canViewProductMaster,
  hasPermission,
  isBranchWarehouseOperator,
} from '@/lib/rbac';

export type WarehouseNavTab = {
  href: string;
  labelKey: string;
};

export const warehouseNavTabs: WarehouseNavTab[] = [
  { href: '/hq-warehouses', labelKey: 'scm.hub.warehouse.hqWarehouses' },
  { href: '/branch-warehouses', labelKey: 'scm.hub.warehouse.branchWarehouses' },
  { href: '/product-master', labelKey: 'scm.hub.warehouse.productMaster' },
  { href: '/inventory/count', labelKey: 'scm.hub.warehouse.stocktake' },
  { href: '/stock-movements', labelKey: 'scm.hub.warehouse.movements' },
];

export function canAccessWarehouseTab(user: User | null | undefined, href: string): boolean {
  if (!user) return false;
  if (isBranchWarehouseOperator(user)) {
    return href === '/inventory/count' || href === '/stock-movements';
  }
  if (href === '/hq-warehouses') return canViewHqWarehouse(user);
  if (href === '/branch-warehouses') return canViewBranchWarehouses(user);
  if (href === '/product-master') return canViewProductMaster(user);
  if (href === '/inventory/count') return canViewInventoryCount(user);
  if (href === '/stock-movements') {
    return hasPermission(user, 'inventory.manage');
  }
  return false;
}

export function visibleWarehouseTabs(user: User | null | undefined): WarehouseNavTab[] {
  return warehouseNavTabs.filter((tab) => canAccessWarehouseTab(user, tab.href));
}

export function isWarehouseTabActive(pathname: string, href: string): boolean {
  if (href === '/hq-warehouses') return pathname.startsWith('/hq-warehouses');
  if (href === '/branch-warehouses') return pathname.startsWith('/branch-warehouses');
  if (href === '/product-master') {
    return (
      pathname === '/product-master' ||
      pathname.startsWith('/products') ||
      pathname.startsWith('/inventory/categories')
    );
  }
  if (href === '/inventory/count') return pathname.startsWith('/inventory/count');
  if (href === '/stock-movements') return pathname.startsWith('/stock-movements');
  if (href === '/inventory') return pathname === '/inventory';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isWarehouseSectionPath(pathname: string): boolean {
  return (
    pathname === '/inventory' ||
    pathname.startsWith('/hq-warehouses') ||
    pathname.startsWith('/branch-warehouses') ||
    pathname === '/product-master' ||
    pathname.startsWith('/products') ||
    pathname.startsWith('/inventory/categories') ||
    pathname.startsWith('/inventory/count') ||
    pathname.startsWith('/stock-movements')
  );
}
