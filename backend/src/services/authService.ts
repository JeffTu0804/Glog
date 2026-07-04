import { SubscriptionPlan, SubscriptionStatus, UserRole } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
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

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
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
