export type SysAdminNavLink = {
  href: string;
  labelKey?: string;
  label?: string;
};

export type SysAdminNavSection = {
  titleKey: string;
  links: readonly SysAdminNavLink[];
};

export const SYSADMIN_NAV_SECTIONS: readonly SysAdminNavSection[] = [
  {
    titleKey: 'sysadmin.nav.hq',
    links: [
      { href: '/dashboard', labelKey: 'nav.dashboard' },
      { href: '/users', labelKey: 'nav.users' },
      { href: '/branches', labelKey: 'nav.branches' },
      { href: '/finance/dashboard', labelKey: 'nav.finance' },
      { href: '/procurement', labelKey: 'scm.sidebar.procurement' },
      { href: '/hq-warehouses', labelKey: 'scm.sidebar.hqWarehouses' },
      { href: '/hq-warehouses/china-receiving', label: 'China Receiving' },
      { href: '/product-master', labelKey: 'scm.sidebar.productMaster' },
      { href: '/pricing', labelKey: 'pricing.title' },
      { href: '/distribution/orders', labelKey: 'distribution.orders' },
      { href: '/supply-chain', labelKey: 'scm.sidebar.supplyChain' },
      { href: '/supply-inquiries', label: 'Supply Inquiries' },
      { href: '/branch-purchase-requests', labelKey: 'nav.hqBranchOrders' },
      { href: '/analytics', labelKey: 'nav.analytics' },
      { href: '/kpi', labelKey: 'nav.kpi' },
      { href: '/investment', label: 'Investment' },
      { href: '/expansion', label: 'Expansion' },
      { href: '/royalty', labelKey: 'nav.royalty' },
    ],
  },
  {
    titleKey: 'sysadmin.nav.hqPanels',
    links: [
      { href: '/hq-sales/sales', label: 'HQ Sales' },
      { href: '/hq-accountant/payment-confirmations', label: 'HQ Accountant' },
      { href: '/finance/cashier-bills', label: 'HQ Cashier' },
      { href: '/finance/bills-to-pay', label: 'HQ Finance Manager' },
      { href: '/finance/transfers', label: 'Finance Transfers' },
      { href: '/procurement/accountant-payments', label: 'Procurement Accountant' },
      { href: '/procurement/cashier-payments', label: 'Procurement Cashier' },
    ],
  },
  {
    titleKey: 'sysadmin.nav.branchPanels',
    links: [
      { href: '/branch-ceo/product-directory', label: 'Branch CEO' },
      { href: '/branch-manager/shipments', label: 'Branch Manager' },
      { href: '/branch-cashier/invoices', label: 'Branch Cashier' },
      { href: '/branch-accountant/invoices', label: 'Branch Accountant' },
      { href: '/branch-warehouse/warehouse', label: 'Branch Warehouse' },
      { href: '/branch-warehouses', labelKey: 'scm.sidebar.branchWarehouses' },
      { href: '/sales', labelKey: 'nav.sales' },
      { href: '/customers', labelKey: 'nav.customers' },
      { href: '/service', labelKey: 'service.title' },
      { href: '/service/kpi', label: 'Service KPI' },
      { href: '/payroll', labelKey: 'payroll.title' },
      { href: '/commissions', labelKey: 'commissions.title' },
      { href: '/tax', labelKey: 'tax.title' },
    ],
  },
  {
    titleKey: 'sysadmin.nav.other',
    links: [
      { href: '/franchise-director/reports', label: 'Franchise Director' },
      { href: '/academy', labelKey: 'nav.academy' },
      { href: '/marketing', labelKey: 'nav.marketing' },
      { href: '/inventory', labelKey: 'nav.inventory' },
      { href: '/warehouse-release', label: 'Warehouse Release' },
      { href: '/returns', labelKey: 'operations.returns' },
      { href: '/reservations', labelKey: 'operations.reservations' },
    ],
  },
  {
    titleKey: 'sysadmin.nav.system',
    links: [
      { href: '/sysadmin/test-data-cleanup', labelKey: 'sysadmin.testDataCleanup' },
    ],
  },
] as const satisfies readonly SysAdminNavSection[];
