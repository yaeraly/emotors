/** Shared route matching for sidebar and section navigation. */

export function isFinancePaymentsRoute(pathname: string) {
  return pathname === '/finance/payments' || pathname.startsWith('/finance/payments/');
}

export function isFinanceShiftsRoute(pathname: string) {
  return pathname === '/finance/shifts' || pathname.startsWith('/finance/shifts/');
}

export function isFinanceModuleRoute(pathname: string) {
  return pathname === '/finance' || pathname.startsWith('/finance/');
}

export function isRouteActive(pathname: string, href: string, search = '') {
  const [pagePath, pageQuery] = href.split('?');
  const pathMatches = pathname === pagePath || (pagePath !== '/' && pathname.startsWith(`${pagePath}/`));
  if (!pathMatches) return false;
  if (!pageQuery) {
    if (pagePath === '/customers') {
      return pathname === '/customers';
    }
    if (pagePath === '/customers/archive') {
      return pathname === '/customers/archive';
    }
    if (pagePath === '/branch-ceo/warehouse') {
      return pathname === '/branch-ceo/warehouse';
    }
    if (pagePath === '/branch-ceo/warehouse/inventory') {
      return pathname === '/branch-ceo/warehouse/inventory' || pathname.startsWith('/branch-ceo/warehouse/inventory/');
    }
    if (pagePath === '/sales') {
      return pathname === '/sales' || pathname.startsWith('/sales/');
    }
    if (pagePath === '/finance/payments' && !pageQuery) {
      const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
      return pathname === '/finance/payments' && !current.has('status');
    }
    if (pagePath === '/finance/shifts' && !pageQuery) {
      const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
      return pathname === '/finance/shifts' && !current.has('status') && !current.has('differences');
    }
    return true;
  }
  const expected = new URLSearchParams(pageQuery);
  const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [key, value] of expected.entries()) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

export function resolveActiveRouteHref(pathname: string, search: string, hrefs: string[]) {
  const matches = hrefs.filter((href) => isRouteActive(pathname, href, search));
  if (!matches.length) return null;
  return matches.sort((a, b) => {
    const aPath = a.split('?')[0];
    const bPath = b.split('?')[0];
    if (bPath.length !== aPath.length) return bPath.length - aPath.length;
    const aQuery = a.includes('?') ? a.split('?')[1] : '';
    const bQuery = b.includes('?') ? b.split('?')[1] : '';
    return bQuery.length - aQuery.length;
  })[0];
}

export function isPathUnderPrefixes(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function sidebarNavClass(pathname: string, href: string, active = isRouteActive(pathname, href)) {
  const base = 'block rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';
  return active ? `${base} bg-blue-50 text-blue-700` : `${base} text-slate-700 hover:bg-slate-50`;
}

export function sidebarFinanceNavClass(pathname: string) {
  return sidebarNavClass(pathname, '/finance/dashboard', isFinanceModuleRoute(pathname));
}

export function sidebarPaymentsNavClass(pathname: string) {
  return sidebarNavClass(pathname, '/finance/payments/pending', isFinancePaymentsRoute(pathname));
}

export function sidebarShiftsNavClass(pathname: string) {
  return sidebarNavClass(pathname, '/finance/shifts?status=OPEN', isFinanceShiftsRoute(pathname));
}

export function sectionTabClass(active: boolean) {
  const base =
    'rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';
  return active
    ? `${base} bg-blue-50 text-blue-700`
    : `${base} text-slate-600 hover:bg-slate-50 hover:text-slate-900`;
}

export function sectionCardClass(active: boolean) {
  const base =
    'rounded-2xl border p-4 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';
  return active
    ? `${base} border-blue-300 bg-blue-50 text-blue-700`
    : `${base} border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:text-blue-700`;
}

export function resolveModuleByLongestPrefix<T extends { pathPrefixes: string[] }>(pathname: string, modules: T[]) {
  const matches = modules.filter((module) => isPathUnderPrefixes(pathname, module.pathPrefixes));
  if (!matches.length) return null;
  return matches.sort((a, b) => {
    const aLen = Math.max(...a.pathPrefixes.map((prefix) => prefix.length));
    const bLen = Math.max(...b.pathPrefixes.map((prefix) => prefix.length));
    return bLen - aLen;
  })[0];
}
