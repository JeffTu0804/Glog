import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ManagerAuthLayout,
  managerLinkClass,
} from "../../components/ManagerAuthLayout";
import { useAuth } from "../../context/AuthContext";
import { signInWithLine } from "../../lib/auth";
import { isHotelAdmin } from "../../lib/hotelAdmin";

export function AdminLoginPage() {
  const { hotelSession, profile, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
  }, [searchParams]);

  if (!loading && hotelSession && isHotelAdmin(profile)) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <ManagerAuthLayout
      title="飯店 Admin 登入"
      subtitle="僅限本飯店主管／經理查看營運資料"
      breadcrumb="Admin 登入"
      footer={
        <div className="mt-6 space-y-2 text-center text-sm">
          <Link to="/login" className={`block ${managerLinkClass}`}>
            返回員工登入
          </Link>
          <Link to="/manager/login" className="text-slate-500 hover:underline">
            平台 Manager 登入
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {!loading && hotelSession && profile && !isHotelAdmin(profile) && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            目前帳號職稱不是主管／經理，無法進入 Admin。請先在員工問卷選擇正確職稱，或聯繫飯店管理員。
          </p>
        )}
        <p className="text-sm text-slate-600">
          使用與員工站相同的 LINE 帳號登入。加入飯店時若職稱選「主管」或「經理」，即可進入本後台，且只能看到自己那一間飯店的資料。
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              signInWithLine("hotelAdmin");
            } catch (err) {
              setError(err instanceof Error ? err.message : "LINE 登入失敗");
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06C755] py-2.5 text-sm font-medium text-white hover:bg-[#05b34c]"
        >
          使用 LINE 登入 Admin
        </button>
      </div>
    </ManagerAuthLayout>
  );
}
