import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthFooterLink, OAuthButtons } from "../components/OAuthButtons";
import { useAuth } from "../context/AuthContext";
import { getDefaultHomePath } from "../lib/homeRoute";
import { registerHotel } from "../lib/auth";
import { hotelSupabase } from "../lib/supabase";

export function RegisterPage() {
  const navigate = useNavigate();
  const { hotelSession, profile, loading, refreshProfile } = useAuth();
  const [hotelName, setHotelName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && profile) {
    return <Navigate to={getDefaultHomePath(profile.role)} replace />;
  }

  function handleHotelNameChange(value: string) {
    setHotelName(value);
    if (!slug || slug === normalizeSlug(hotelName)) {
      setSlug(normalizeSlug(value));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const { data, error: signUpError } = await hotelSupabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: adminName },
        },
      });

      if (signUpError) throw signUpError;

      const token = data.session?.access_token;

      if (!token) {
        setError(
          "註冊信已寄出，請先到信箱點確認連結，再回來登入完成飯店設定",
        );
        return;
      }

      await registerHotel(token, { hotelName, slug, adminName });
      await refreshProfile();
      navigate("/guest-requests");
    } catch (err) {
      setError(err instanceof Error ? err.message : "註冊失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">註冊新飯店</h1>
          <p className="mt-1 text-sm text-slate-500">建立飯店帳號並成為管理員</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <Field label="飯店名稱" value={hotelName} onChange={handleHotelNameChange} required />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              飯店代碼（英文）
            </label>
            <input
              value={slug}
              onChange={(e) => setSlug(normalizeSlug(e.target.value))}
              required
              placeholder="demo-hotel"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-400">用於識別飯店，建立後不可輕易更改</p>
          </div>
          <Field label="您的姓名（管理員）" value={adminName} onChange={setAdminName} required />
          <Field label="Email" value={email} onChange={setEmail} type="email" required />
          <Field label="密碼" value={password} onChange={setPassword} type="password" required />

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "註冊中…" : "建立飯店帳號"}
          </button>
        </form>

        <OAuthButtons onError={setError} disabled={submitting} />

        <AuthFooterLink mode="register" />

        <p className="mt-4 text-center text-xs text-slate-400">
          使用 LINE 註冊？請先點 LINE 登入，再填寫飯店資料
        </p>
        {hotelSession && !profile && (
          <Link
            to="/register/complete"
            className="mt-2 block text-center text-sm text-indigo-600 hover:underline"
          >
            已完成 LINE 登入？繼續填寫飯店資料 →
          </Link>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
