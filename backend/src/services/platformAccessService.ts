import { AppError } from "../errors/AppError.js";
import { prisma } from "../lib/prisma.js";
import { notifyManagersOfManagerAccessRequest } from "./managerApprovalNotificationService.js";

export async function requestManagerAccess(input: {
  supabaseUserId: string;
  email: string;
  name?: string;
}) {
  const existing = await prisma.authProfile.findUnique({
    where: { id: input.supabaseUserId },
  });

  if (existing?.role === "manager") {
    return {
      status: "approved" as const,
      message: "此帳號已具有 Manager 權限",
    };
  }

  const profile = await prisma.authProfile.upsert({
    where: { id: input.supabaseUserId },
    update: {
      email: input.email.trim().toLowerCase(),
      name: input.name?.trim() || existing?.name || undefined,
      role: "user",
      managerAccessStatus: "pending",
      managerRequestedAt: existing?.managerAccessStatus === "pending" ? existing.managerRequestedAt : new Date(),
      managerReviewedAt: null,
      managerReviewedBy: null,
    },
    create: {
      id: input.supabaseUserId,
      email: input.email.trim().toLowerCase(),
      name: input.name?.trim() || undefined,
      role: "user",
      managerAccessStatus: "pending",
      managerRequestedAt: new Date(),
    },
  });

  const notification = await notifyManagersOfManagerAccessRequest({
    userId: profile.id,
    email: profile.email ?? input.email,
    name: profile.name ?? null,
    requestedAt: profile.managerRequestedAt ?? null,
  });

  return {
    status: profile.managerAccessStatus,
    message: notification.message,
  };
}

export async function getOwnManagerAccessStatus(supabaseUserId: string) {
  const profile = await prisma.authProfile.findUnique({
    where: { id: supabaseUserId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      managerAccessStatus: true,
      managerRequestedAt: true,
      managerReviewedAt: true,
    },
  });

  return profile
    ? {
        ...profile,
        managerRequestedAt: profile.managerRequestedAt?.toISOString() ?? null,
        managerReviewedAt: profile.managerReviewedAt?.toISOString() ?? null,
      }
    : null;
}

export async function listPendingManagerAccessRequests() {
  const requests = await prisma.authProfile.findMany({
    where: { managerAccessStatus: "pending" },
    orderBy: { managerRequestedAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      managerAccessStatus: true,
      managerRequestedAt: true,
    },
  });

  return requests.map((r) => ({
    ...r,
    managerRequestedAt: r.managerRequestedAt?.toISOString() ?? null,
  }));
}

export async function reviewManagerAccessRequest(input: {
  userId: string;
  reviewerId: string;
  decision: "approve" | "reject";
}) {
  const existing = await prisma.authProfile.findUnique({
    where: { id: input.userId },
  });

  if (!existing) {
    throw new AppError(404, "找不到此使用者的 Manager 申請");
  }

  if (existing.managerAccessStatus !== "pending") {
    throw new AppError(400, "此申請目前不是待審核狀態");
  }

  const updated = await prisma.authProfile.update({
    where: { id: input.userId },
    data: {
      role: input.decision === "approve" ? "manager" : "user",
      managerAccessStatus: input.decision === "approve" ? "approved" : "rejected",
      managerReviewedAt: new Date(),
      managerReviewedBy: input.reviewerId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      managerAccessStatus: true,
      managerRequestedAt: true,
      managerReviewedAt: true,
    },
  });

  // 同步 Mongo AuthAccount
  try {
    const { connectMongo } = await import("../lib/mongo.js");
    const { AuthAccount } = await import("../models/AuthAccount.js");
    await connectMongo();
    await AuthAccount.findByIdAndUpdate(input.userId, {
      portalRole: input.decision === "approve" ? "manager" : "user",
      managerAccessStatus: input.decision === "approve" ? "approved" : "rejected",
      managerReviewedAt: new Date(),
      managerReviewedBy: input.reviewerId,
    });
  } catch {
    /* Prisma 仍為 Manager 審核來源之一；Mongo 同步失敗不阻斷 */
  }

  return {
    ...updated,
    managerRequestedAt: updated.managerRequestedAt?.toISOString() ?? null,
    managerReviewedAt: updated.managerReviewedAt?.toISOString() ?? null,
  };
}
