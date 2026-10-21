import { cleanAccountEntry } from './account-entry';

describe('Account entry cleanup before bootstrap', () => {
  afterEach(() => cleanAccountEntry({ pathname: '/login', search: '' }, () => {}));
  it('removes the complete token query before session restoration can run', () => {
    const replace = jasmine.createSpy('replace');
    cleanAccountEntry({ pathname: '/app/account/reset-password', search: '?token=private&email=private%40example.test' }, replace);
    expect(replace).toHaveBeenCalledOnceWith('/app/account/reset-password');
  });
  it('leaves clean account URLs and unrelated query filters alone', () => {
    const replace = jasmine.createSpy('replace');
    cleanAccountEntry({ pathname: '/account/forgot-password', search: '' }, replace);
    cleanAccountEntry({ pathname: '/workspace/platform/organizations', search: '?search=token' }, replace);
    expect(replace).not.toHaveBeenCalled();
  });
});
