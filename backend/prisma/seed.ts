import { PrismaClient, SubscriptionPlan, SubscriptionStatus, UserRole } from "@prisma/client";
import { buildHotelRoomAssets } from "../src/services/tenantBootstrapService.js";

const prisma = new PrismaClient();

/**
 * 開發用 Seed 資料。
 * 執行前請先在 Supabase Auth 建立使用者，並將 UUID 填入 SEED_SUPABASE_USER_ID。
 */
async function main() {
  const supabaseUserId = process.env.SEED_SUPABASE_USER_ID;

  if (!supabaseUserId) {
    console.warn(
      "⚠️  未設定 SEED_SUPABASE_USER_ID，跳過 User 建立。",
      "請在 Supabase Auth 建立使用者後，將 UUID 加入 .env 再重新執行 seed。",
    );
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-hotel" },
    update: {
      contactEmail: "contact@demo-hotel.com",
      plan: SubscriptionPlan.PRO,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
    create: {
      name: "Demo 飯店",
      slug: "demo-hotel",
      contactEmail: "contact@demo-hotel.com",
      plan: SubscriptionPlan.TRIAL,
      subscriptionStatus: SubscriptionStatus.TRIAL,
    },
  });

  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  if (supabaseUserId) {
    const admin = await prisma.user.upsert({
      where: { supabaseUserId },
      update: {},
      create: {
        tenantId: tenant.id,
        supabaseUserId,
        email: "admin@demo-hotel.com",
        name: "Demo 管理員",
        role: UserRole.ADMIN,
        skills: ["management"],
      },
    });

    console.log(`✅ Admin User: ${admin.name} (${admin.id})`);
  }

  const engineerSupabaseUserId = process.env.SEED_ENGINEER_SUPABASE_USER_ID;

  if (engineerSupabaseUserId) {
    const engineer = await prisma.user.upsert({
      where: { supabaseUserId: engineerSupabaseUserId },
      update: {},
      create: {
        tenantId: tenant.id,
        supabaseUserId: engineerSupabaseUserId,
        email: "engineer@demo-hotel.com",
        name: "Demo 工程師",
        role: UserRole.ENGINEER,
        skills: ["plumbing", "electrical", "hvac"],
      },
    });

    console.log(`✅ Engineer User: ${engineer.name} (${engineer.id})`);
  } else {
    console.warn(
      "⚠️  未設定 SEED_ENGINEER_SUPABASE_USER_ID，跳過工程師建立。",
    );
  }

  const assets = await prisma.asset.createMany({
    data: buildHotelRoomAssets().map((asset) => ({ tenantId: tenant.id, ...asset })),
    skipDuplicates: true,
  });

  console.log(`✅ 地點（客房）: ${assets.count} 筆`);

  const inventory = await prisma.inventory.upsert({
    where: { tenantId_sku: { tenantId: tenant.id, sku: "FAUCET-001" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "水龍頭墊片",
      sku: "FAUCET-001",
      category: "衛浴",
      quantity: 50,
      unit: "個",
      unitCost: 120,
      reorderLevel: 10,
    },
  });

  console.log(`✅ Inventory: ${inventory.name} (${inventory.id})`);

  const platformAdminId = process.env.SEED_PLATFORM_ADMIN_SUPABASE_USER_ID;

  if (platformAdminId) {
    const platformAdmin = await prisma.platformAdmin.upsert({
      where: { supabaseUserId: platformAdminId },
      update: {},
      create: {
        supabaseUserId: platformAdminId,
        email: "platform@glog.app",
        name: "glog 平台管理員",
      },
    });

    console.log(`✅ Platform Admin: ${platformAdmin.name} (${platformAdmin.id})`);
  } else {
    console.warn(
      "⚠️  未設定 SEED_PLATFORM_ADMIN_SUPABASE_USER_ID，跳過平台管理員建立。",
    );
  }
}

main()
  .catch((err) => {
    console.error("Seed 失敗:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
