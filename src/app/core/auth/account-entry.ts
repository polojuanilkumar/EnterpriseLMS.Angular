// Runs before bootstrap/session restoration. Raw links belong to the server capture route.
export let rejectedAccountPath: string | null = null;
export function cleanAccountEntry(location: Pick<Location, 'pathname' | 'search'>, replace: (path: string) => void): void {
  rejectedAccountPath = null;
  if (/^\/(?:app\/)?account\/(?:invitation|reset-password)$/.test(location.pathname)
    && new URLSearchParams(location.search).has('token')) {
    rejectedAccountPath = location.pathname;
    replace(location.pathname);
  }
}
