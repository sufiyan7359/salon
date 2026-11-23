import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, AuthTokens, PublicUser } from '../models/user.model';

const ACCESS_TOKEN_KEY = 'salon_access_token';
const REFRESH_TOKEN_KEY = 'salon_refresh_token';
const USER_KEY = 'salon_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUserSignal = signal<PublicUser | null>(
    this.readStoredUser(),
  );

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);
  readonly isCustomer = computed(
    () => this.currentUserSignal()?.role === 'customer',
  );
  readonly isOwner = computed(() => this.currentUserSignal()?.role === 'owner');

  private refreshInFlight: Promise<string | null> | null = null;

  constructor(private readonly http: HttpClient) {}

  sendOtp(phoneNumber: string) {
    return firstValueFrom(
      this.http.post<{ expiresInMinutes: number; devOtp?: string }>(
        `${environment.apiUrl}/auth/send-otp`,
        { phoneNumber },
      ),
    );
  }

  async verifyOtp(
    phoneNumber: string,
    otpCode: string,
    name?: string,
  ): Promise<PublicUser> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${environment.apiUrl}/auth/verify-otp`, {
        phoneNumber,
        otpCode,
        name,
      }),
    );
    this.persistSession(response);
    return response.user;
  }

  async ownerLogin(email: string, password: string): Promise<PublicUser> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${environment.apiUrl}/auth/owner/login`, {
        email,
        password,
      }),
    );
    this.persistSession(response);
    return response.user;
  }

  async ownerRegister(
    name: string,
    email: string,
    password: string,
  ): Promise<PublicUser> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${environment.apiUrl}/auth/owner/register`, {
        name,
        email,
        password,
      }),
    );
    this.persistSession(response);
    return response.user;
  }

  logout(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUserSignal.set(null);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  // Concurrent 401s all share one in-flight refresh instead of racing separate calls.
  refreshAccessToken(): Promise<string | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<string | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.logout();
      return null;
    }

    try {
      const tokens = await firstValueFrom(
        this.http.post<AuthTokens>(`${environment.apiUrl}/auth/refresh-token`, {
          refreshToken,
        }),
      );
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      return tokens.accessToken;
    } catch {
      this.logout();
      return null;
    }
  }

  private persistSession(response: AuthResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this.currentUserSignal.set(response.user);
  }

  private readStoredUser(): PublicUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PublicUser;
    } catch {
      return null;
    }
  }
}
