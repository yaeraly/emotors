import { Role } from '@prisma/client';

export type AuthUser = {
  id: string;
  email: string | null;
  fullName: string;
  role: Role;
  branchId: string | null;
  status?: string;
  permissions?: string[];
};
