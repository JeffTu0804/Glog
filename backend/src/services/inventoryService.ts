import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";

export interface CreateInventoryInput {
  name: string;
  sku?: string;
  category?: string;
  quantity?: number;
  unit?: string;
  unitCost: number;
  reorderLevel?: number;
}

export interface UpdateInventoryInput {
  name?: string;
  sku?: string;
  category?: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  reorderLevel?: number;
}

export interface ListInventoryQuery {
  category?: string;
  lowStock?: boolean;
}

export async function findInventoryForTenant(
  tenantId: string,
  inventoryId: string,
) {
  const item = await prisma.inventory.findFirst({
    where: withTenantScope(tenantId, { id: inventoryId }),
  });

  if (!item) {
    throw new AppError(404, "找不到庫存項目");
  }

  return item;
}

export async function listInventory(
  tenantId: string,
  query: ListInventoryQuery,
) {
  const where: Prisma.InventoryWhereInput = { tenantId };

  if (query.category) {
    where.category = query.category;
  }

  const items = await prisma.inventory.findMany({
    where,
    orderBy: { name: "asc" },
  });

  if (query.lowStock) {
    return items.filter((item) => item.quantity <= item.reorderLevel);
  }

  return items;
}

export async function createInventory(
  tenantId: string,
  input: CreateInventoryInput,
) {
  if (input.sku) {
    const existing = await prisma.inventory.findFirst({
      where: withTenantScope(tenantId, { sku: input.sku }),
    });

    if (existing) {
      throw new AppError(409, "此料號已存在");
    }
  }

  if (input.quantity !== undefined && input.quantity < 0) {
    throw new AppError(400, "quantity 不可為負數");
  }

  return prisma.inventory.create({
    data: {
      tenantId,
      name: input.name,
      sku: input.sku,
      category: input.category,
      quantity: input.quantity ?? 0,
      unit: input.unit ?? "個",
      unitCost: new Prisma.Decimal(input.unitCost),
      reorderLevel: input.reorderLevel ?? 0,
    },
  });
}

export async function updateInventory(
  tenantId: string,
  inventoryId: string,
  input: UpdateInventoryInput,
) {
  await findInventoryForTenant(tenantId, inventoryId);

  if (input.sku) {
    const duplicate = await prisma.inventory.findFirst({
      where: {
        tenantId,
        sku: input.sku,
        NOT: { id: inventoryId },
      },
    });

    if (duplicate) {
      throw new AppError(409, "此料號已存在");
    }
  }

  if (input.quantity !== undefined && input.quantity < 0) {
    throw new AppError(400, "quantity 不可為負數");
  }

  const data: Prisma.InventoryUpdateInput = {
    name: input.name,
    sku: input.sku,
    category: input.category,
    quantity: input.quantity,
    unit: input.unit,
    reorderLevel: input.reorderLevel,
  };

  if (input.unitCost !== undefined) {
    data.unitCost = new Prisma.Decimal(input.unitCost);
  }

  return prisma.inventory.update({
    where: { id: inventoryId },
    data,
  });
}
