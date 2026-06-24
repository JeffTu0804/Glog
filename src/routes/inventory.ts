import { UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/AppError.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  createInventory,
  findInventoryForTenant,
  listInventory,
  updateInventory,
} from "../services/inventoryService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getParamId,
  parseOptionalString,
  parseRequiredString,
} from "../utils/validators.js";

export const inventoryRouter = Router();

function parseQuantity(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AppError(400, `${fieldName} 必須為整數`);
  }
  return value;
}

function parseUnitCost(value: unknown): number {
  if (typeof value !== "number" || value < 0) {
    throw new AppError(400, "unitCost 必須為非負數字");
  }
  return value;
}

/**
 * GET /api/v1/inventory
 * 列出本租戶耗材庫存，支援 category / lowStock 篩選
 */
inventoryRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { category, lowStock } = req.query;

    const items = await listInventory(req.user!.tenantId, {
      category: typeof category === "string" ? category : undefined,
      lowStock: lowStock === "true",
    });

    res.json({ items });
  }),
);

/**
 * GET /api/v1/inventory/:id
 * 取得單筆庫存詳情
 */
inventoryRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await findInventoryForTenant(
      req.user!.tenantId,
      getParamId(req.params, "庫存 ID"),
    );

    res.json({ item });
  }),
);

/**
 * POST /api/v1/inventory
 * 新增耗材（管理員）
 */
inventoryRouter.post(
  "/",
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const { name, sku, category, quantity, unit, unitCost, reorderLevel } =
      req.body as Record<string, unknown>;

    const item = await createInventory(req.user!.tenantId, {
      name: parseRequiredString(name, "name"),
      sku: parseOptionalString(sku, "sku"),
      category: parseOptionalString(category, "category"),
      quantity: parseQuantity(quantity, "quantity"),
      unit: parseOptionalString(unit, "unit"),
      unitCost: parseUnitCost(unitCost),
      reorderLevel: parseQuantity(reorderLevel, "reorderLevel"),
    });

    res.status(201).json({ item });
  }),
);

/**
 * PATCH /api/v1/inventory/:id
 * 更新耗材庫存（管理員）
 */
inventoryRouter.patch(
  "/:id",
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const { name, sku, category, quantity, unit, unitCost, reorderLevel } =
      req.body as Record<string, unknown>;

    const item = await updateInventory(
      req.user!.tenantId,
      getParamId(req.params, "庫存 ID"),
      {
        name: name !== undefined ? parseRequiredString(name, "name") : undefined,
        sku: sku !== undefined ? parseOptionalString(sku, "sku") : undefined,
        category:
          category !== undefined
            ? parseOptionalString(category, "category")
            : undefined,
        quantity: parseQuantity(quantity, "quantity"),
        unit: unit !== undefined ? parseOptionalString(unit, "unit") : undefined,
        unitCost: unitCost !== undefined ? parseUnitCost(unitCost) : undefined,
        reorderLevel: parseQuantity(reorderLevel, "reorderLevel"),
      },
    );

    res.json({ item });
  }),
);
