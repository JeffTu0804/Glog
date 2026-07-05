import { SubscriptionPlan, SubscriptionStatus, UserRole } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { roleToDepartment } from "../utils/department.js";
import { seedStarterAssets } from "./tenantBootstrapService.js";
import { ensureHotelForTenant, syncRoomsFromAssets } from "./hotelBootstrapService.js";

export interface RegisterHotelInput {
  supabaseUserId: string;
  email: string;
  hotelName: string;
  slug: string;
  adminName: string;
  lineUserId?: string;
}

export interface JoinHotelInput {
  supabaseUserId: string;
  email: string;
  slug: string;
  name: string;
  role: UserRole;
  lineUserId?: string;
}

const JOINABLE_ROLES = new Set<UserRole>([
  UserRole.FRONT_DESK,
  UserRole.HOUSEKEEPING,
  UserRole.ENGINEER,
  UserRole.FOOD_BEVERAGE,
]);

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function defaultSkillsForRole(role: UserRole): string[] {
  if (role === UserRole.ENGINEER) return ["general"];
  if (role === UserRole.ADMIN) return ["management"];
  return [];
}

export async function lookupTenantBySlug(slug: string) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: normalized },
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionStatus: true,
    },
  });

  if (!tenant || tenant.subscriptionStatus === SubscriptionStatus.CANCELLED) {
    return null;
  }

  return tenant;
}

/** 加入現有飯店（LINE / Email 員工首次登入後填寫） */
export async function joinHotel(input: JoinHotelInput) {
  if (!JOINABLE_ROLES.has(input.role)) {
    throw new AppError(400, "請選擇有效的部門職位；管理員請使用「建立新飯店」流程");
  }

  const slug = normalizeSlug(input.slug);
  if (!slug) {
    throw new AppError(400, "請輸入飯店代碼");
  }

  if (!input.name.trim()) {
    throw new AppError(400, "姓名為必填");
  }

  const existingUser = await prisma.user.findUnique({
    where: { supabaseUserId: input.supabaseUserId },
  });

  if (existingUser) {
    throw new AppError(409, "此帳號已加入飯店，請直接登入");
  }

  const tenant = await lookupTenantBySlug(slug);
  if (!tenant) {
    throw new AppError(404, "找不到此飯店代碼，請向管理員確認後再試");
  }

  const email = input.email.trim().toLowerCase();
  const department = roleToDepartment(input.role);

  return prisma.$transaction(async (tx) => {
    await tx.authProfile.upsert({
      where: { id: input.supabaseUserId },
      update: {
        email,
        name: input.name.trim(),
        role: "user",
      },
      create: {
        id: input.supabaseUserId,
        email,
        name: input.name.trim(),
        role: "user",
        managerAccessStatus: "none",
      },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        supabaseUserId: input.supabaseUserId,
        email: email || `${input.supabaseUserId}@oauth.local`,
        name: input.name.trim(),
        role: input.role,
        skills: defaultSkillsForRole(input.role),
        lineUserId: input.lineUserId?.trim() || undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        skills: true,
        tenantId: true,
      },
    });

    return { tenant, user, department };
  });
}

export async function registerHotel(input: RegisterHotelInput) {
  const slug = normalizeSlug(input.slug);

  if (!slug || slug.length < 2) {
    throw new AppError(400, "飯店代碼至少需 2 個字元（英文、數字、連字號）");
  }

  if (!input.adminName.trim()) {
    throw new AppError(400, "管理員姓名為必填");
  }

  if (!input.hotelName.trim()) {
    throw new AppError(400, "飯店名稱為必填");
  }

  const existingUser = await prisma.user.findUnique({
    where: { supabaseUserId: input.supabaseUserId },
  });

  if (existingUser) {
    throw new AppError(409, "此帳號已註冊，請直接登入");
  }

  const existingSlug = await prisma.tenant.findUnique({ where: { slug } });

  if (existingSlug) {
    throw new AppError(409, "此飯店代碼已被使用，請換一個");
  }

  const email = input.email.trim().toLowerCase();

  return prisma.$transaction(async (tx) => {
    await tx.authProfile.upsert({
      where: { id: input.supabaseUserId },
      update: {
        email,
        name: input.adminName.trim(),
        role: "user",
        managerAccessStatus: "none",
      },
      create: {
        id: input.supabaseUserId,
        email,
        name: input.adminName.trim(),
        role: "user",
        managerAccessStatus: "none",
      },
    });

    const tenant = await tx.tenant.create({
      data: {
        name: input.hotelName.trim(),
        slug,
        contactEmail: email || undefined,
        plan: SubscriptionPlan.TRIAL,
        subscriptionStatus: SubscriptionStatus.TRIAL,
      },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        supabaseUserId: input.supabaseUserId,
        email: email || `${input.supabaseUserId}@oauth.local`,
        name: input.adminName.trim(),
        role: UserRole.ADMIN,
        skills: ["management"],
        lineUserId: input.lineUserId?.trim() || undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        skills: true,
      },
    });

    await seedStarterAssets(tx, tenant.id);

    const hotel = await ensureHotelForTenant(tx, tenant.id, input.hotelName.trim());
    await syncRoomsFromAssets(tx, tenant.id);

    return { tenant, user, hotel };
  });
}
