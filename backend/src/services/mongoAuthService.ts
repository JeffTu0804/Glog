import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { AppError } from "../errors/AppError.js";
import { connectMongo } from "../lib/mongo.js";
import { signAuthToken, type AuthTokenPayload } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import {
  AuthAccount,
  type AuthAccountDocument,
} from "../models/AuthAccount.js";

const SALT_ROUNDS = 10;

export type AuthAccountPublic = {
  id: string;
  email: string;
  name: string;
  portalRole: "user" | "manager";
  managerAccessStatus: string;
  lineUserId: string | null;
};

function toPublic(doc: AuthAccountDocument): AuthAccountPublic {
  return {
    id: String(doc._id),
    email: doc.email,
    name: doc.name || "",
    portalRole: doc.portalRole === "manager" ? "manager" : "user",
    managerAccessStatus: doc.managerAccessStatus || "none",
    lineUserId: doc.lineUserId ?? null,
  };
}

function tokenPayload(doc: AuthAccountDocument): AuthTokenPayload {
  return {
    sub: String(doc._id),
    email: doc.email,
    name: doc.name || "",
    portalRole: doc.portalRole === "manager" ? "manager" : "user",
    lineSub: doc.lineUserId ?? undefined,
  };
}

export function issueTokenForAccount(doc: AuthAccountDocument): string {
  return signAuthToken(tokenPayload(doc));
}

/** 同步 Prisma profiles，讓既有 Manager 審核流程仍可用 */
async function syncPrismaProfile(doc: AuthAccountDocument) {
  const id = String(doc._id);
  await prisma.authProfile.upsert({
    where: { id },
    create: {
      id,
      email: doc.email,
      name: doc.name || null,
      role: doc.portalRole === "manager" ? "manager" : "user",
      managerAccessStatus: doc.managerAccessStatus || "none",
      managerRequestedAt: doc.managerRequestedAt ?? null,
      managerReviewedAt: doc.managerReviewedAt ?? null,
      managerReviewedBy: doc.managerReviewedBy ?? null,
    },
    update: {
      email: doc.email,
      name: doc.name || null,
      role: doc.portalRole === "manager" ? "manager" : "user",
      managerAccessStatus: doc.managerAccessStatus || "none",
      managerRequestedAt: doc.managerRequestedAt ?? null,
      managerReviewedAt: doc.managerReviewedAt ?? null,
      managerReviewedBy: doc.managerReviewedBy ?? null,
    },
  });

  // 若有 legacy UUID，也更新舊 profile（若存在）
  if (doc.legacySupabaseUserId && doc.legacySupabaseUserId !== id) {
    await prisma.authProfile
      .updateMany({
        where: { id: doc.legacySupabaseUserId },
        data: {
          email: doc.email,
          name: doc.name || null,
          role: doc.portalRole === "manager" ? "manager" : "user",
          managerAccessStatus: doc.managerAccessStatus || "none",
        },
      })
      .catch(() => undefined);
  }
}

export async function findAuthAccountById(id: string) {
  await connectMongo();
  return AuthAccount.findById(id);
}

export async function resolveHotelUserIds(account: AuthAccountDocument): Promise<string[]> {
  const ids = [String(account._id)];
  if (account.legacySupabaseUserId) ids.push(account.legacySupabaseUserId);
  return ids;
}

export async function signupWithPassword(input: {
  email: string;
  password: string;
  name?: string;
  asManagerApplicant?: boolean;
}) {
  await connectMongo();
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password || input.password.length < 6) {
    throw new AppError(400, "Email 與密碼（至少 6 碼）為必填");
  }

  const existing = await AuthAccount.findOne({ email });
  if (existing) {
    throw new AppError(409, "此 Email 已註冊，請直接登入");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const doc = await AuthAccount.create({
    email,
    passwordHash,
    name: input.name?.trim() || email.split("@")[0] || "",
    portalRole: "user",
    managerAccessStatus: input.asManagerApplicant ? "pending" : "none",
    managerRequestedAt: input.asManagerApplicant ? new Date() : null,
  });

  await syncPrismaProfile(doc);

  const token = issueTokenForAccount(doc);
  return { token, account: toPublic(doc) };
}

export async function loginWithPassword(input: {
  email: string;
  password: string;
  target: "hotel" | "platform";
}) {
  await connectMongo();
  const email = input.email.trim().toLowerCase();
  const doc = await AuthAccount.findOne({ email });
  if (!doc || !doc.passwordHash) {
    throw new AppError(401, "帳號或密碼錯誤");
  }

  const ok = await bcrypt.compare(input.password, doc.passwordHash);
  if (!ok) {
    throw new AppError(401, "帳號或密碼錯誤");
  }

  if (input.target === "platform") {
    if (doc.portalRole === "manager" || doc.managerAccessStatus === "approved") {
      // ok
    } else if (doc.managerAccessStatus === "pending") {
      throw new AppError(403, "Manager 權限申請待審核");
    } else if (doc.managerAccessStatus === "rejected") {
      throw new AppError(403, "Manager 權限申請已被拒絕");
    } else {
      throw new AppError(403, "非平台管理員，無法存取營運後台");
    }
  }

  const token = issueTokenForAccount(doc);
  return { token, account: toPublic(doc) };
}

export async function findOrCreateLineAccount(input: {
  lineUserId: string;
  email?: string;
  name?: string;
}) {
  await connectMongo();
  const lineUserId = input.lineUserId.trim();
  if (!lineUserId) throw new AppError(400, "缺少 LINE user id");

  let doc = await AuthAccount.findOne({ lineUserId });
  if (doc) {
    if (input.name?.trim() && !doc.name) {
      doc.name = input.name.trim();
      await doc.save();
    }
    await syncPrismaProfile(doc);
    return doc;
  }

  const email =
    input.email?.trim().toLowerCase() ||
    `line_${lineUserId}@line.oauth.local`;

  const byEmail = await AuthAccount.findOne({ email });
  if (byEmail) {
    byEmail.lineUserId = lineUserId;
    if (input.name?.trim()) byEmail.name = input.name.trim();
    await byEmail.save();
    await syncPrismaProfile(byEmail);
    return byEmail;
  }

  doc = await AuthAccount.create({
    email,
    passwordHash: null,
    name: input.name?.trim() || "LINE 使用者",
    lineUserId,
    portalRole: "user",
    managerAccessStatus: "none",
  });
  await syncPrismaProfile(doc);
  return doc;
}

export async function changePassword(input: {
  accountId: string;
  currentPassword?: string;
  newPassword: string;
}) {
  await connectMongo();
  if (!input.newPassword || input.newPassword.length < 6) {
    throw new AppError(400, "新密碼至少 6 碼");
  }
  const doc = await AuthAccount.findById(input.accountId);
  if (!doc) throw new AppError(404, "帳號不存在");

  if (doc.passwordHash) {
    if (!input.currentPassword) {
      throw new AppError(400, "請提供目前密碼");
    }
    const ok = await bcrypt.compare(input.currentPassword, doc.passwordHash);
    if (!ok) throw new AppError(401, "目前密碼不正確");
  }

  doc.passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  doc.passwordResetTokenHash = null;
  doc.passwordResetExpiresAt = null;
  await doc.save();
  return toPublic(doc);
}

export async function createPasswordResetToken(email: string) {
  await connectMongo();
  const doc = await AuthAccount.findOne({ email: email.trim().toLowerCase() });
  // 不洩漏是否存在
  if (!doc) {
    return { ok: true as const, resetUrl: null as string | null };
  }

  const raw = randomBytes(32).toString("hex");
  doc.passwordResetTokenHash = createHash("sha256").update(raw).digest("hex");
  doc.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await doc.save();

  const frontendUrl = (process.env.FRONTEND_URL?.trim() || "http://localhost:5173").replace(
    /\/$/,
    "",
  );
  const resetUrl = `${frontendUrl}/reset-password?token=${raw}`;
  return { ok: true as const, resetUrl, email: doc.email };
}

export async function resetPasswordWithToken(input: {
  token: string;
  newPassword: string;
}) {
  await connectMongo();
  if (!input.newPassword || input.newPassword.length < 6) {
    throw new AppError(400, "新密碼至少 6 碼");
  }
  const hash = createHash("sha256").update(input.token).digest("hex");
  const doc = await AuthAccount.findOne({
    passwordResetTokenHash: hash,
    passwordResetExpiresAt: { $gt: new Date() },
  });
  if (!doc) throw new AppError(400, "重設連結無效或已過期");

  doc.passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  doc.passwordResetTokenHash = null;
  doc.passwordResetExpiresAt = null;
  await doc.save();
  return toPublic(doc);
}

export async function markManagerApproved(accountId: string, reviewerId: string) {
  await connectMongo();
  const doc = await AuthAccount.findById(accountId);
  if (!doc) return null;
  doc.portalRole = "manager";
  doc.managerAccessStatus = "approved";
  doc.managerReviewedAt = new Date();
  doc.managerReviewedBy = reviewerId;
  await doc.save();
  await syncPrismaProfile(doc);
  return doc;
}
