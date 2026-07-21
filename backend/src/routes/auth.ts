import { Router } from "express";
import { UserPositionLevel, UserRole } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { authenticateSupabase } from "../middleware/supabaseAuth.js";
import {
  joinHotel,
  lookupTenantBySlug,
  registerHotel,
} from "../services/authService.js";
import {
  changePassword,
  createPasswordResetToken,
  loginWithPassword,
  resetPasswordWithToken,
  signupWithPassword,
} from "../services/mongoAuthService.js";
import { requestManagerAccess } from "../services/platformAccessService.js";
import { DEPARTMENT_LABELS, roleToDepartment } from "../utils/department.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "管理員",
  FRONT_DESK: "客務部",
  HOUSEKEEPING: "房務",
  ENGINEER: "工程師",
  FOOD_BEVERAGE: "餐飲部",
};

function parseJoinRole(value: unknown): UserRole {
  if (typeof value !== "string" || !Object.values(UserRole).includes(value as UserRole)) {
    throw new AppError(400, "請選擇有效的部門");
  }
  return value as UserRole;
}

function parsePositionLevel(value: unknown): UserPositionLevel | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !Object.values(UserPositionLevel).includes(value as UserPositionLevel)
  ) {
    throw new AppError(400, "請選擇有效的職稱");
  }
  return value as UserPositionLevel;
}

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { email, password, name, asManagerApplicant } = req.body as {
      email?: unknown;
      password?: unknown;
      name?: unknown;
      asManagerApplicant?: unknown;
    };
    if (typeof email !== "string" || typeof password !== "string") {
      throw new AppError(400, "email 與 password 為必填");
    }

    const result = await signupWithPassword({
      email,
      password,
      name: typeof name === "string" ? name : undefined,
      asManagerApplicant: asManagerApplicant === true,
    });

    if (asManagerApplicant === true) {
      await requestManagerAccess({
        supabaseUserId: result.account.id,
        email: result.account.email,
        name: result.account.name,
      });
    }

    res.status(201).json(result);
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password, target } = req.body as {
      email?: unknown;
      password?: unknown;
      target?: unknown;
    };
    if (typeof email !== "string" || typeof password !== "string") {
      throw new AppError(400, "email 與 password 為必填");
    }
    const portal = target === "platform" ? "platform" : "hotel";
    const result = await loginWithPassword({ email, password, target: portal });
    res.json(result);
  }),
);

authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    if (!email.trim()) throw new AppError(400, "email 為必填");
    const result = await createPasswordResetToken(email);
    res.json({
      ok: true,
      message: "若 Email 存在，已產生重設連結",
      resetUrl: result.resetUrl,
    });
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (!token || !newPassword) {
      throw new AppError(400, "token 與 newPassword 為必填");
    }
    await resetPasswordWithToken({ token, newPassword });
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/change-password",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const currentPassword =
      typeof req.body?.currentPassword === "string"
        ? req.body.currentPassword
        : undefined;
    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const account = await changePassword({
      accountId: req.supabaseAuth!.id,
      currentPassword,
      newPassword,
    });
    res.json({ account });
  }),
);

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

authRouter.post(
  "/join",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const { slug, name, role, positionLevel } = req.body as {
      slug?: unknown;
      name?: unknown;
      role?: unknown;
      positionLevel?: unknown;
    };

    if (typeof slug !== "string" || !slug.trim()) {
      throw new AppError(400, "飯店代碼為必填");
    }
    if (typeof name !== "string" || !name.trim()) {
      throw new AppError(400, "姓名為必填");
    }

    const auth = req.supabaseAuth!;
    const parsedRole = parseJoinRole(role);
    const parsedPositionLevel = parsePositionLevel(positionLevel);

    const result = await joinHotel({
      supabaseUserId: auth.id,
      email: auth.email,
      slug,
      name,
      role: parsedRole,
      positionLevel: parsedPositionLevel,
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

authRouter.get(
  "/status",
  authenticateSupabase,
  asyncHandler(async (req, res) => {
    const auth = req.supabaseAuth!;

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { supabaseUserId: auth.id },
          ...(auth.email ? [{ email: auth.email.toLowerCase() }] : []),
        ],
      },
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
