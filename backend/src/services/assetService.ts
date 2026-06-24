import { AssetStatus, AssetType, type Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { withTenantScope } from "../utils/tenantScope.js";
import { parseEnumValue } from "../utils/validators.js";

const VALID_TYPES = Object.values(AssetType);
const VALID_STATUSES = Object.values(AssetStatus);

export interface CreateAssetInput {
  name: string;
  code: string;
  type: AssetType;
  location?: string;
  description?: string;
}

export interface UpdateAssetInput {
  name?: string;
  code?: string;
  type?: AssetType;
  status?: AssetStatus;
  location?: string;
  description?: string;
}

export interface ListAssetsQuery {
  type?: AssetType;
  status?: AssetStatus;
}

export function parseAssetType(value: unknown): AssetType {
  return parseEnumValue(value, VALID_TYPES, "type");
}

export function parseAssetStatus(value: unknown): AssetStatus {
  return parseEnumValue(value, VALID_STATUSES, "status");
}

export async function findAssetForTenant(tenantId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: withTenantScope(tenantId, { id: assetId }),
  });

  if (!asset) {
    throw new AppError(404, "找不到資產");
  }

  return asset;
}

export async function listAssets(tenantId: string, query: ListAssetsQuery) {
  const where: Prisma.AssetWhereInput = { tenantId };

  if (query.type) {
    where.type = query.type;
  }
  if (query.status) {
    where.status = query.status;
  }

  return prisma.asset.findMany({
    where,
    orderBy: { code: "asc" },
  });
}

export async function createAsset(tenantId: string, input: CreateAssetInput) {
  const existing = await prisma.asset.findFirst({
    where: withTenantScope(tenantId, { code: input.code }),
  });

  if (existing) {
    throw new AppError(409, "此資產編號已存在");
  }

  return prisma.asset.create({
    data: {
      tenantId,
      name: input.name,
      code: input.code,
      type: input.type,
      location: input.location,
      description: input.description,
    },
  });
}

export async function updateAsset(
  tenantId: string,
  assetId: string,
  input: UpdateAssetInput,
) {
  await findAssetForTenant(tenantId, assetId);

  if (input.code) {
    const duplicate = await prisma.asset.findFirst({
      where: {
        tenantId,
        code: input.code,
        NOT: { id: assetId },
      },
    });

    if (duplicate) {
      throw new AppError(409, "此資產編號已存在");
    }
  }

  return prisma.asset.update({
    where: { id: assetId },
    data: input,
  });
}
