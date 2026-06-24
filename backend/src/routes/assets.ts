import { UserRole } from "@prisma/client";
import { Router } from "express";
import { requireRole } from "../middleware/requireRole.js";
import { prisma } from "../lib/prisma.js";
import { seedStarterAssets } from "../services/tenantBootstrapService.js";
import {
  createAsset,
  findAssetForTenant,
  listAssets,
  parseAssetStatus,
  parseAssetType,
  updateAsset,
} from "../services/assetService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getParamId,
  parseOptionalString,
  parseRequiredString,
} from "../utils/validators.js";

export const assetsRouter = Router();

/**
 * POST /api/v1/assets/seed-starter
 * 一鍵建立 10 層 × 10 間客房（管理員）
 */
assetsRouter.post(
  "/seed-starter",
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.tenantId;

    await prisma.$transaction(async (tx) => {
      await seedStarterAssets(tx, tenantId);
    });

    const assets = await listAssets(tenantId, {});
    res.status(201).json({ assets, created: assets.length });
  }),
);

/**
 * GET /api/v1/assets
 * 列出本租戶資產，支援 type / status 篩選
 */
assetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { type, status } = req.query;

    const assets = await listAssets(req.user!.tenantId, {
      type: type !== undefined ? parseAssetType(type) : undefined,
      status: status !== undefined ? parseAssetStatus(status) : undefined,
    });

    res.json({ assets });
  }),
);

/**
 * GET /api/v1/assets/:id
 * 取得單筆資產詳情
 */
assetsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const asset = await findAssetForTenant(
      req.user!.tenantId,
      getParamId(req.params, "資產 ID"),
    );

    res.json({ asset });
  }),
);

/**
 * POST /api/v1/assets
 * 建立資產（管理員）
 */
assetsRouter.post(
  "/",
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const { name, code, type, location, description } = req.body as Record<
      string,
      unknown
    >;

    const asset = await createAsset(req.user!.tenantId, {
      name: parseRequiredString(name, "name"),
      code: parseRequiredString(code, "code"),
      type: parseAssetType(type),
      location: parseOptionalString(location, "location"),
      description: parseOptionalString(description, "description"),
    });

    res.status(201).json({ asset });
  }),
);

/**
 * PATCH /api/v1/assets/:id
 * 更新資產（管理員）
 */
assetsRouter.patch(
  "/:id",
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const { name, code, type, status, location, description } =
      req.body as Record<string, unknown>;

    const asset = await updateAsset(
      req.user!.tenantId,
      getParamId(req.params, "資產 ID"),
      {
        name: name !== undefined ? parseRequiredString(name, "name") : undefined,
        code: code !== undefined ? parseRequiredString(code, "code") : undefined,
        type: type !== undefined ? parseAssetType(type) : undefined,
        status: status !== undefined ? parseAssetStatus(status) : undefined,
        location:
          location !== undefined
            ? parseOptionalString(location, "location")
            : undefined,
        description:
          description !== undefined
            ? parseOptionalString(description, "description")
            : undefined,
      },
    );

    res.json({ asset });
  }),
);
