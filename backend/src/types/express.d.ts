import type { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  supabaseUserId: string;
  role: UserRole;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
