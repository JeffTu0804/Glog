import { Router } from "express";
import { AppError } from "../../errors/AppError.js";
import {
  findTenantOrThrow,
  getPlatformOverview,
  getTenantAssets,
  getTenantCostLogs,
  getTenantInventory,
  getTenantTickets,
  getTenantUsers,
  listPlatformCostLogs,
  listPlatformInventory,
  listPlatformUsers,
  listTenants,
  parseSubscriptionPlan,
  parseSubscriptionStatus,
  parseUpdatePlatformUserBody,
  updatePlatformUser,
  updateTenantSubscription,
} from "../../services/platformService.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getParamId } from "../../utils/validators.js";

export const platformTenantsRouter = Router();

/**
 * GET /api/platform/v1/stats
 * 平台總覽統計
 */
platformTenantsRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const stats = await getPlatformOverview();
    res.json({ stats });
  }),
);

/**
 * GET /api/platform/v1/tenants
 * 列出所有租戶（含用量統計）
 */
platformTenantsRouter.get(
  "/tenants",
  asyncHandler(async (req, res) => {
    const { status, plan, search } = req.query;

    const tenants = await listTenants({
      status:
        status !== undefined
          ? parseSubscriptionStatus(status)
          : undefined,
      plan: plan !== undefined ? parseSubscriptionPlan(plan) : undefined,
      search: typeof search === "string" ? search : undefined,
    });

    res.json({ tenants });
  }),
);

/**
 * GET /api/platform/v1/tenants/:id
 * 租戶詳情與統計
 */
platformTenantsRouter.get(
  "/tenants/:id",
  asyncHandler(async (req, res) => {
    const tenant = await findTenantOrThrow(getParamId(req.params, "租戶 ID"));
    res.json({ tenant });
  }),
);

/**
 * PATCH /api/platform/v1/tenants/:id/subscription
 * 更新租戶訂閱狀態
 */
platformTenantsRouter.patch(
  "/tenants/:id/subscription",
  asyncHandler(async (req, res) => {
    const { plan, subscriptionStatus, subscriptionEndsAt, contactEmail } =
      req.body as Record<string, unknown>;

    if (contactEmail !== undefined && typeof contactEmail !== "string") {
      throw new AppError(400, "contactEmail 必須為字串");
    }

    let endsAt: Date | null | undefined;
    if (subscriptionEndsAt === null) {
      endsAt = null;
    } else if (typeof subscriptionEndsAt === "string") {
      endsAt = new Date(subscriptionEndsAt);
      if (Number.isNaN(endsAt.getTime())) {
        throw new AppError(400, "subscriptionEndsAt 格式無效");
      }
    }

    const tenant = await updateTenantSubscription(
      getParamId(req.params, "租戶 ID"),
      {
        plan: plan !== undefined ? parseSubscriptionPlan(plan) : undefined,
        subscriptionStatus:
          subscriptionStatus !== undefined
            ? parseSubscriptionStatus(subscriptionStatus)
            : undefined,
        subscriptionEndsAt: endsAt,
        contactEmail:
          typeof contactEmail === "string" ? contactEmail : undefined,
      },
    );

    res.json({ tenant });
  }),
);

/**
 * GET /api/platform/v1/tenants/:id/tickets
 * 租戶工單歷史
 */
platformTenantsRouter.get(
  "/tenants/:id/tickets",
  asyncHandler(async (req, res) => {
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const tickets = await getTenantTickets(
      getParamId(req.params, "租戶 ID"),
      status,
    );
    res.json({ tickets });
  }),
);

/**
 * GET /api/platform/v1/tenants/:id/cost-logs
 * 租戶成本歷史
 */
platformTenantsRouter.get(
  "/tenants/:id/cost-logs",
  asyncHandler(async (req, res) => {
    const costLogs = await getTenantCostLogs(getParamId(req.params, "租戶 ID"));
    res.json({ costLogs });
  }),
);

/**
 * GET /api/platform/v1/tenants/:id/users
 * 租戶員工列表
 */
platformTenantsRouter.get(
  "/tenants/:id/users",
  asyncHandler(async (req, res) => {
    const users = await getTenantUsers(getParamId(req.params, "租戶 ID"));
    res.json({ users });
  }),
);

/**
 * GET /api/platform/v1/tenants/:id/assets
 * 租戶資產列表
 */
platformTenantsRouter.get(
  "/tenants/:id/assets",
  asyncHandler(async (req, res) => {
    const assets = await getTenantAssets(getParamId(req.params, "租戶 ID"));
    res.json({ assets });
  }),
);

/**
 * GET /api/platform/v1/tenants/:id/inventory
 * 租戶耗材庫存
 */
platformTenantsRouter.get(
  "/tenants/:id/inventory",
  asyncHandler(async (req, res) => {
    const items = await getTenantInventory(getParamId(req.params, "租戶 ID"));
    res.json({ items });
  }),
);

/**
 * GET /api/platform/v1/inventory
 * 跨租戶庫存總覽
 */
platformTenantsRouter.get(
  "/inventory",
  asyncHandler(async (req, res) => {
    const tenantId =
      typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
    const lowStock = req.query.lowStock === "true";
    const items = await listPlatformInventory({ tenantId, lowStock });
    res.json({ items });
  }),
);

/**
 * GET /api/platform/v1/cost-logs
 * 跨租戶成本紀錄
 */
platformTenantsRouter.get(
  "/cost-logs",
  asyncHandler(async (req, res) => {
    const tenantId =
      typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
    const costLogs = await listPlatformCostLogs({ tenantId });
    res.json({ costLogs });
  }),
);

/**
 * GET /api/platform/v1/users
 * 跨租戶員工列表
 */
platformTenantsRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const tenantId =
      typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
    const users = await listPlatformUsers({ tenantId });
    res.json({ users });
  }),
);

/**
 * PATCH /api/platform/v1/users/:id
 * 更新員工（飯店、角色、姓名、狀態）
 */
platformTenantsRouter.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const input = parseUpdatePlatformUserBody(req.body as Record<string, unknown>);
    const user = await updatePlatformUser(getParamId(req.params, "員工 ID"), input);
    res.json({ user });
  }),
);
