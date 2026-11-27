import { environment } from '../../../environments/environment';

export function backendBffUrl(path = ''): string {
  const suffix = path ? '/' + path.replace(/^\/+/, '') : '';
  return environment.apiUrl.replace(/\/+$/, '') + '/bff' + suffix;
}

export function isBffUrl(url: string): boolean {
  const backendOrigin = new URL(environment.apiUrl).origin;
  const path = url.startsWith('/') && !url.startsWith('//')
    ? url.split('?')[0]
    : url.startsWith(backendOrigin + '/bff/') ? url.slice(backendOrigin.length).split('?')[0] : '';
  return path.startsWith('/bff/') && !/[\\%#]/.test(path)
    && !path.split('/').some(segment => segment === '.' || segment === '..');
}
