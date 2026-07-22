import type { Department, UserPositionLevel, UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  supabaseUserId: string;
  role: UserRole;
  positionLevel: UserPositionLevel;
  email: string;
  name: string;
  department: Department;
  isHotelAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
