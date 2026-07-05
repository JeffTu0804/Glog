import { Router } from "express";
import { UserRole } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { authenticateSupabase } from "../middleware/supabaseAuth.js";
import {
  joinHotel,
  lookupTenantBySlug,
  registerHotel,
} from "../services/authService.js";
import { DEPARTMENT_LABELS, roleToDepartment } from "../utils/department.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "管理員",
  FRONT_DESK: "前台",
  HOUSEKEEPING: "房務",
  ENGINEER: "工程師",
  FOOD_BEVERAGE: "餐飲部",
};

function parseJoinRole(value: unknown): UserRole {
  if (typeof value !== "string" || !Object.values(UserRole).includes(value as UserRole)) {
    throw new AppError(400, "請選擇有效的職位");
  }
  return value as UserRole;
}

/**
 * GET /api/v1/auth/tenants/lookup?slug=demo-hotel
 * 依飯店代碼查詢（供 onboarding 表單確認）
 */
authRouter.get(
  "/tenants/lookup",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const slug = typeof req.query.slug === "string" ? req.query.slug : "";
    const tenant = await lookupTenantBySlug(slug);

    if (!tenant) {
      res.json({ found: false });
      return;
    }

    res.json({
      found: true,
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
      },
    });
  }),
);

/**
 * POST /api/v1/auth/join
 * 加入現有飯店（LINE 員工首次登入填寫部門職位）
 */
authRouter.post(
  "/join",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const { slug, name, role } = req.body as {
      slug?: unknown;
      name?: unknown;
      role?: unknown;
    };

    if (typeof slug !== "string" || !slug.trim()) {
      throw new AppError(400, "飯店代碼為必填");
    }
    if (typeof name !== "string" || !name.trim()) {
      throw new AppError(400, "姓名為必填");
    }

    const auth = req.supabaseAuth!;
    const parsedRole = parseJoinRole(role);

    const result = await joinHotel({
      supabaseUserId: auth.id,
      email: auth.email,
      slug,
      name,
      role: parsedRole,
      lineUserId: auth.lineSub,
    });

    res.status(201).json({
      tenant: result.tenant,
      user: result.user,
      department: result.department,
      departmentLabel: DEPARTMENT_LABELS[result.department],
      roleLabel: ROLE_LABELS[result.user.role],
    });
  }),
);

/**
 * POST /api/v1/auth/register
 * 註冊新飯店租戶 + 第一位管理員（需先完成 Supabase signUp / OAuth）
 */
authRouter.post(
  "/register",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const { hotelName, slug, adminName } = req.body as {
      hotelName?: unknown;
      slug?: unknown;
      adminName?: unknown;
    };

    if (typeof hotelName !== "string" || !hotelName.trim()) {
      throw new AppError(400, "hotelName 為必填");
    }
    if (typeof slug !== "string" || !slug.trim()) {
      throw new AppError(400, "slug 為必填");
    }
    if (typeof adminName !== "string" || !adminName.trim()) {
      throw new AppError(400, "adminName 為必填");
    }

    const auth = req.supabaseAuth!;

    const result = await registerHotel({
      supabaseUserId: auth.id,
      email: auth.email,
      hotelName,
      slug,
      adminName,
      lineUserId: auth.lineSub,
    });

    res.status(201).json(result);
  }),
);

/**
 * GET /api/v1/auth/status
 * 檢查 Supabase 帳號是否已完成 glog 註冊
 */
authRouter.get(
  "/status",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const auth = req.supabaseAuth!;

    const user = await prisma.user.findUnique({
      where: { supabaseUserId: auth.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        lineUserId: true,
        tenant: { select: { name: true, slug: true } },
      },
    });

    res.json({
      registered: !!user,
      isLineUser: !!auth.lineSub,
      user: user
        ? {
            ...user,
            department: roleToDepartment(user.role),
            roleLabel: ROLE_LABELS[user.role],
          }
        : null,
    });
  }),
);
