import { UserRole, UserStatus, type Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { parseEnumValue } from "../utils/validators.js";

const VALID_ROLES = Object.values(UserRole);
const VALID_STATUSES = Object.values(UserStatus);

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  skills: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export interface CreateUserInput {
  supabaseUserId: string;
  email: string;
  name: string;
  role: UserRole;
  skills?: string[];
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  role?: UserRole;
  status?: UserStatus;
  skills?: string[];
}

export interface ListUsersQuery {
  role?: UserRole;
  status?: UserStatus;
}

export function parseUserRole(value: unknown): UserRole {
  return parseEnumValue(value, VALID_ROLES, "role");
}

export function parseUserStatus(value: unknown): UserStatus {
  return parseEnumValue(value, VALID_STATUSES, "status");
}

export async function findUserForTenant(tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: withTenantScope(tenantId, { id: userId }),
    select: USER_PUBLIC_SELECT,
  });

  if (!user) {
    throw new AppError(404, "找不到員工");
  }

  return user;
}

export async function listUsers(tenantId: string, query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = { tenantId };

  if (query.role) {
    where.role = query.role;
  }
  if (query.status) {
    where.status = query.status;
  }

  return prisma.user.findMany({
    where,
    select: USER_PUBLIC_SELECT,
    orderBy: { name: "asc" },
  });
}

export async function createUser(tenantId: string, input: CreateUserInput) {
  const existingSupabase = await prisma.user.findUnique({
    where: { supabaseUserId: input.supabaseUserId },
  });

  if (existingSupabase) {
    throw new AppError(409, "此 Supabase 使用者已註冊");
  }

  const existingEmail = await prisma.user.findFirst({
    where: withTenantScope(tenantId, { email: input.email }),
  });

  if (existingEmail) {
    throw new AppError(409, "此 email 已存在於本租戶");
  }

  return prisma.user.create({
    data: {
      tenantId,
      supabaseUserId: input.supabaseUserId,
      email: input.email,
      name: input.name,
      role: input.role,
      skills: input.skills ?? [],
    },
    select: USER_PUBLIC_SELECT,
  });
}

export async function updateUser(
  tenantId: string,
  userId: string,
  input: UpdateUserInput,
) {
  await findUserForTenant(tenantId, userId);

  if (input.email) {
    const duplicate = await prisma.user.findFirst({
      where: {
        tenantId,
        email: input.email,
        NOT: { id: userId },
      },
    });

    if (duplicate) {
      throw new AppError(409, "此 email 已存在於本租戶");
    }
  }

  return prisma.user.update({
    where: { id: userId },
    data: input,
    select: USER_PUBLIC_SELECT,
  });
}
