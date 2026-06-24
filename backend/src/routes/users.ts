import { UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/AppError.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  createUser,
  findUserForTenant,
  listUsers,
  parseUserRole,
  parseUserStatus,
  updateUser,
} from "../services/userService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getParamId,
  parseOptionalString,
  parseOptionalStringArray,
  parseRequiredString,
} from "../utils/validators.js";

export const usersRouter = Router();

/**
 * GET /api/v1/users
 * 列出本租戶員工，支援 role / status 篩選（派單時查工程師）
 */
usersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { role, status } = req.query;

    const users = await listUsers(req.user!.tenantId, {
      role: role !== undefined ? parseUserRole(role) : undefined,
      status: status !== undefined ? parseUserStatus(status) : undefined,
    });

    res.json({ users });
  }),
);

/**
 * GET /api/v1/users/:id
 * 取得單筆員工詳情
 */
usersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await findUserForTenant(
      req.user!.tenantId,
      getParamId(req.params, "員工 ID"),
    );

    res.json({ user });
  }),
);

/**
 * POST /api/v1/users
 * 將 Supabase Auth 使用者註冊至本租戶（管理員）
 */
usersRouter.post(
  "/",
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const { supabaseUserId, email, name, role, skills } = req.body as Record<
      string,
      unknown
    >;

    if (typeof supabaseUserId !== "string" || !supabaseUserId) {
      throw new AppError(400, "supabaseUserId 為必填");
    }

    const user = await createUser(req.user!.tenantId, {
      supabaseUserId,
      email: parseRequiredString(email, "email"),
      name: parseRequiredString(name, "name"),
      role: parseUserRole(role),
      skills: parseOptionalStringArray(skills, "skills"),
    });

    res.status(201).json({ user });
  }),
);

/**
 * PATCH /api/v1/users/:id
 * 更新員工資料（管理員）
 */
usersRouter.patch(
  "/:id",
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const { email, name, role, status, skills } = req.body as Record<
      string,
      unknown
    >;

    const user = await updateUser(
      req.user!.tenantId,
      getParamId(req.params, "員工 ID"),
      {
        email:
          email !== undefined ? parseRequiredString(email, "email") : undefined,
        name: name !== undefined ? parseRequiredString(name, "name") : undefined,
        role: role !== undefined ? parseUserRole(role) : undefined,
        status: status !== undefined ? parseUserStatus(status) : undefined,
        skills:
          skills !== undefined
            ? parseOptionalStringArray(skills, "skills")
            : undefined,
      },
    );

    res.json({ user });
  }),
);
