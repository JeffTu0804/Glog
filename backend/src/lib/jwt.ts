import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError.js";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  name: string;
  portalRole: "user" | "manager";
  lineSub?: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new AppError(
      500,
      "缺少 JWT_SECRET 環境變數，請在 backend/.env 設定後重啟",
    );
  }
  return secret;
}

function getExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || "7d";
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getExpiresIn(),
  } as jwt.SignOptions);
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded || typeof decoded === "string") {
      throw new AppError(401, "無效或已過期的 token");
    }
    const payload = decoded as jwt.JwtPayload;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new AppError(401, "無效或已過期的 token");
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
      portalRole: payload.portalRole === "manager" ? "manager" : "user",
      lineSub: typeof payload.lineSub === "string" ? payload.lineSub : undefined,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, "無效或已過期的 token");
  }
}
