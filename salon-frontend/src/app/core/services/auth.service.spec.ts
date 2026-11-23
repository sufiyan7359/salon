import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts unauthenticated when localStorage is empty', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  it('persists the session and flips isAuthenticated after verifyOtp succeeds', async () => {
    const promise = service.verifyOtp('+910000000000', '123456', 'Test User');

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/verify-otp`);
    expect(req.request.method).toBe('POST');
    req.flush({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'u1', name: 'Test User', role: 'customer', phoneNumber: '+910000000000', email: null },
    });

    const user = await promise;
    expect(user.role).toBe('customer');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.isCustomer()).toBe(true);
    expect(service.getAccessToken()).toBe('access-1');
  });

  it('marks isOwner true after an owner login', async () => {
    const promise = service.ownerLogin('owner@test.com', 'password123');

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/owner/login`);
    req.flush({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      user: { id: 'o1', name: 'Owner', role: 'owner', phoneNumber: null, email: 'owner@test.com' },
    });

    await promise;
    expect(service.isOwner()).toBe(true);
    expect(service.isCustomer()).toBe(false);
  });

  it('clears the session and tokens on logout', async () => {
    const promise = service.verifyOtp('+910000000000', '123456');
    httpMock.expectOne(`${environment.apiUrl}/auth/verify-otp`).flush({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'u1', name: null, role: 'customer', phoneNumber: '+910000000000', email: null },
    });
    await promise;
    expect(service.isAuthenticated()).toBe(true);

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.getAccessToken()).toBeNull();
  });

  it('restores the session from localStorage on a fresh instance (e.g. page reload)', async () => {
    const promise = service.verifyOtp('+910000000000', '123456');
    httpMock.expectOne(`${environment.apiUrl}/auth/verify-otp`).flush({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'u1', name: 'Persisted', role: 'customer', phoneNumber: '+910000000000', email: null },
    });
    await promise;

    // Simulate a fresh page load: a brand new service instance reading the same localStorage.
    const freshService = new AuthService(TestBed.inject(HttpClient));
    expect(freshService.currentUser()?.name).toBe('Persisted');
  });
});
