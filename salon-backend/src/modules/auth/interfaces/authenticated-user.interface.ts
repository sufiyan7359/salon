import { UserRole } from '../../users/entities/user.entity';

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  phoneNumber: string | null;
  email: string | null;
}
