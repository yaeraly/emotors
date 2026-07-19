/** Shared route matching for sidebar and section navigation. */

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
    if (pagePath === '/sales') {
      return pathname === '/sales' || pathname.startsWith('/sales/');
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
  return matches.sort((a, b) => b.split('?')[0].length - a.split('?')[0].length)[0];
}

export function isPathUnderPrefixes(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function sidebarNavClass(pathname: string, href: string, active = isRouteActive(pathname, href)) {
  const base = 'block rounded-xl px-3 py-2 text-sm font-semibold';
  return active ? `${base} bg-blue-50 text-blue-700` : `${base} text-slate-700 hover:bg-slate-50`;
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
