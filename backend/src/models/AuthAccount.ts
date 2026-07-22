import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const authAccountSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, default: null },
    name: { type: String, default: "" },
    lineUserId: { type: String, default: null, sparse: true, unique: true },
    /** user = 飯店員工；manager = 平台管理員 */
    portalRole: {
      type: String,
      enum: ["user", "manager"],
      default: "user",
    },
    managerAccessStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    managerRequestedAt: { type: Date, default: null },
    managerReviewedAt: { type: Date, default: null },
    managerReviewedBy: { type: String, default: null },
    /** 舊 Supabase Auth UUID，用來對到既有 Prisma User / profiles */
    legacySupabaseUserId: { type: String, default: null, index: true },
    /**
     * Prisma profiles.id 需要 UUID；Mongo _id 是 ObjectId（24 hex）無法寫入。
     * JWT sub / 對外 auth id 一律用這個欄位。
     */
    profileUuid: { type: String, default: null, unique: true, sparse: true },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "authAccounts" },
);

type AuthAccountFields = InferSchemaType<typeof authAccountSchema>;

export type AuthAccountDocument = mongoose.HydratedDocument<AuthAccountFields>;

export const AuthAccount: Model<AuthAccountFields> =
  (mongoose.models.AuthAccount as Model<AuthAccountFields> | undefined) ??
  mongoose.model<AuthAccountFields>("AuthAccount", authAccountSchema);
