import { Role } from '@prisma/client';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  roles: Role[];
  branchId: string;
  status?: string;
  permissions?: string[];
};
