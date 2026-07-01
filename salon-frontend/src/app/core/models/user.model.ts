export type UserRole = 'customer' | 'owner' | 'staff' | 'admin';

export interface PublicUser {
  id: string;
  name: string | null;
  role: UserRole;
  phoneNumber: string | null;
  email: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: PublicUser;
}
