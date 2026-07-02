import type { Department, UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  supabaseUserId: string;
  role: UserRole;
  email: string;
  name: string;
  department: Department;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
