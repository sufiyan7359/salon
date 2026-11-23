import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

// Lets any pending promise continuations (microtasks) run before the next assertion -
// needed because this project's tests run zoneless, so fakeAsync()/tick() aren't available.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches the stored access token to API requests', () => {
    localStorage.setItem('salon_access_token', 'my-token');

    http.get(`${environment.apiUrl}/salons`).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/salons`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-token');
    req.flush([]);
  });

  it('refreshes an expired token and retries the original request transparently', async () => {
    localStorage.setItem('salon_access_token', 'expired-token');
    localStorage.setItem('salon_refresh_token', 'valid-refresh-token');
    localStorage.setItem(
      'salon_user',
      JSON.stringify({ id: 'u1', name: null, role: 'owner', phoneNumber: null, email: 'o@b.com' }),
    );

    let result: unknown;
    http.get(`${environment.apiUrl}/salons`).subscribe((res) => (result = res));

    const firstAttempt = httpMock.expectOne(`${environment.apiUrl}/salons`);
    expect(firstAttempt.request.headers.get('Authorization')).toBe('Bearer expired-token');
    firstAttempt.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await flushAsync();

    const refreshReq = httpMock.expectOne(`${environment.apiUrl}/auth/refresh-token`);
    expect(refreshReq.request.body).toEqual({ refreshToken: 'valid-refresh-token' });
    refreshReq.flush({ accessToken: 'fresh-token', refreshToken: 'fresh-refresh-token' });
    await flushAsync();

    const retriedAttempt = httpMock.expectOne(`${environment.apiUrl}/salons`);
    expect(retriedAttempt.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    retriedAttempt.flush([{ id: 'salon-1' }]);
    await flushAsync();

    expect(result).toEqual([{ id: 'salon-1' }]);
    expect(localStorage.getItem('salon_access_token')).toBe('fresh-token');
  });

  it('logs the user out when the refresh token itself is invalid', async () => {
    localStorage.setItem('salon_access_token', 'expired-token');
    localStorage.setItem('salon_refresh_token', 'also-expired');

    let capturedError: any;
    http.get(`${environment.apiUrl}/salons`).subscribe({
      error: (err) => (capturedError = err),
    });

    const firstAttempt = httpMock.expectOne(`${environment.apiUrl}/salons`);
    firstAttempt.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await flushAsync();

    const refreshReq = httpMock.expectOne(`${environment.apiUrl}/auth/refresh-token`);
    refreshReq.flush(
      { message: 'Invalid or expired refresh token' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await flushAsync();

    expect(capturedError.status).toBe(401);
    expect(authService.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('salon_access_token')).toBeNull();
  });

  it('does not attempt a refresh loop for the auth endpoints themselves', () => {
    localStorage.setItem('salon_access_token', 'some-token');

    http
      .post(`${environment.apiUrl}/auth/owner/login`, { email: 'a', password: 'b' })
      .subscribe({ error: () => undefined });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/owner/login`);
    req.flush({ message: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });

    httpMock.expectNone(`${environment.apiUrl}/auth/refresh-token`);
  });
});
