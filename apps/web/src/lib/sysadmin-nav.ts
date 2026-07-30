export type SysAdminNavLink = {
  href: string;
  labelKey?: string;
  label?: string;
};

export type SysAdminNavSection = {
  titleKey: string;
  links: SysAdminNavLink[];
};

export const SYSADMIN_NAV_SECTIONS: SysAdminNavSection[] = [
  {
    titleKey: 'sysadmin.nav.hq',
    links: [
      { href: '/dashboard', labelKey: 'nav.dashboard' },
      { href: '/users', labelKey: 'nav.users' },
      { href: '/branches', labelKey: 'nav.branches' },
      { href: '/finance/dashboard', labelKey: 'nav.finance' },
      { href: '/procurement', labelKey: 'scm.sidebar.procurement' },
      { href: '/hq-warehouses', labelKey: 'scm.sidebar.hqWarehouses' },
      { href: '/product-master', labelKey: 'scm.sidebar.productMaster' },
      { href: '/pricing', labelKey: 'pricing.title' },
      { href: '/distribution/orders', labelKey: 'distribution.orders' },
      { href: '/analytics', labelKey: 'nav.analytics' },
    ],
  },
  {
    titleKey: 'sysadmin.nav.hqPanels',
    links: [
      { href: '/hq-sales/sales', label: 'HQ Sales' },
      { href: '/hq-accountant/payment-confirmations', label: 'HQ Accountant' },
      { href: '/finance/cashier-bills', label: 'HQ Cashier' },
      { href: '/finance/bills-to-pay', label: 'HQ Finance / Bills' },
      { href: '/procurement/accountant-payments', label: 'Procurement Accountant' },
    ],
  },
  {
    titleKey: 'sysadmin.nav.branchPanels',
    links: [
      { href: '/branch-ceo/product-directory', label: 'Branch CEO' },
      { href: '/branch-cashier/invoices', label: 'Branch Cashier' },
      { href: '/branch-accountant/invoices', label: 'Branch Accountant' },
      { href: '/branch-warehouse/warehouse', label: 'Branch Warehouse' },
      { href: '/branch-purchase-requests', labelKey: 'nav.hqBranchOrders' },
      { href: '/sales', labelKey: 'nav.sales' },
      { href: '/customers', labelKey: 'nav.customers' },
      { href: '/service', labelKey: 'service.title' },
    ],
  },
  {
    titleKey: 'sysadmin.nav.system',
    links: [
      { href: '/sysadmin/test-data-cleanup', labelKey: 'sysadmin.testDataCleanup' },
    ],
  },
];
