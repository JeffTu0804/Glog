import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors/AppError.js";
import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";

export interface LineProfile {
  sub: string;
  name?: string;
  picture?: string;
  email?: string;
}

function getLineConfig() {
  const channelId = process.env.LINE_CHANNEL_ID?.trim();
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  const redirectUri =
    process.env.LINE_REDIRECT_URI?.trim() ||
    "http://localhost:3000/api/v1/auth/line/callback";
  const frontendUrl = process.env.FRONTEND_URL?.trim() || "http://localhost:5173";

  if (!channelId || !channelSecret) {
    throw new AppError(
      503,
      "LINE 登入尚未設定，請在 backend/.env 填入 LINE_CHANNEL_ID 與 LINE_CHANNEL_SECRET",
    );
  }

  return { channelId, channelSecret, redirectUri, frontendUrl };
}

export function createLineOAuthState(): string {
  const { channelSecret } = getLineConfig();
  const payload = `${Date.now()}:${randomBytes(12).toString("hex")}`;
  const sig = createHmac("sha256", channelSecret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyLineOAuthState(state: string): boolean {
  try {
    const { channelSecret } = getLineConfig();
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const dot = decoded.lastIndexOf(".");
    if (dot === -1) return false;

    const payload = decoded.slice(0, dot);
    const sig = decoded.slice(dot + 1);
    const expected = createHmac("sha256", channelSecret)
      .update(payload)
      .digest("hex");

    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return false;

    const ts = Number(payload.split(":")[0]);
    return Number.isFinite(ts) && Date.now() - ts < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

export function buildLineAuthorizeUrl(state: string): string {
  const { channelId, redirectUri } = getLineConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: channelId,
    redirect_uri: redirectUri,
    state,
    scope: "profile openid email",
  });

  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  const payloadPart = parts[1];
  if (!payloadPart) {
    throw new AppError(502, "LINE 回傳的 id_token 格式不正確");
  }

  const json = Buffer.from(payloadPart, "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

export async function exchangeLineCode(code: string): Promise<LineProfile> {
  const { channelId, channelSecret, redirectUri } = getLineConfig();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: channelId,
    client_secret: channelSecret,
  });

  const res = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.id_token) {
    throw new AppError(
      502,
      data.error_description ?? data.error ?? "LINE token 交換失敗",
    );
  }

  const claims = decodeJwtPayload(data.id_token);

  return {
    sub: String(claims.sub ?? ""),
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };
}

function lineEmail(profile: LineProfile): string {
  if (profile.email?.trim()) {
    return profile.email.trim().toLowerCase();
  }
  return `line_${profile.sub}@line.oauth.local`;
}

export async function createLineSignInLink(profile: LineProfile): Promise<string> {
  const admin = getSupabaseAdmin();
  const email = lineEmail(profile);

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: profile.name,
      avatar_url: profile.picture,
      line_sub: profile.sub,
    },
    app_metadata: { provider: "line" },
  });

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw new AppError(502, `建立 Supabase 使用者失敗：${createError.message}`);
  }

  const { frontendUrl } = getLineConfig();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${frontendUrl}/auth/callback` },
  });

  if (error || !data.properties?.action_link) {
    throw new AppError(502, error?.message ?? "無法建立登入連結");
  }

  return data.properties.action_link;
}
