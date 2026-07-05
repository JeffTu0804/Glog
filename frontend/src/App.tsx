import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PlatformLayout } from "./components/PlatformLayout";
import { useAuth } from "./context/AuthContext";
import { getDefaultHomePath } from "./lib/homeRoute";
import { AssetsPage } from "./pages/AssetsPage";
import { HomePage } from "./pages/HomePage";
import { LandingPage } from "./pages/LandingPage";
import { AuthCallbackPage, CompleteRegistrationPage } from "./pages/AuthCallbackPage";
import { LogbookPage } from "./pages/LogbookPage";
import { GuestRequestsPage } from "./pages/GuestRequestsPage";
import { GuestScanPage } from "./pages/GuestScanPage";
import { QrRoomsPage } from "./pages/QrRoomsPage";
import { LoginPage, ManagerLoginPage } from "./pages/LoginPage";
import { ManagerApplyPage } from "./pages/ManagerApplyPage";
import {
  ForgotPasswordPage,
  ManagerForgotPasswordPage,
  ManagerResetPasswordPage,
  ResetPasswordPage,
} from "./pages/PasswordRecoveryPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { EngineeringDepartmentPage } from "./pages/departments/EngineeringDepartmentPage";
import { FoodBeverageDepartmentPage } from "./pages/departments/FoodBeverageDepartmentPage";
import { HousekeepingDepartmentPage } from "./pages/departments/HousekeepingDepartmentPage";
import { PlatformDashboardPage } from "./pages/platform/PlatformDashboardPage";
import { PlatformCostLogsPage } from "./pages/platform/PlatformCostLogsPage";
import { PlatformInventoryPage } from "./pages/platform/PlatformInventoryPage";
import { PlatformUsersPage } from "./pages/platform/PlatformUsersPage";
import { TenantDetailPage } from "./pages/platform/TenantDetailPage";

function HotelProtectedRoute({ children }: { children: React.ReactNode }) {
  const { hotelSession, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        載入中…
      </div>
    );
  }

  if (!hotelSession) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/register/complete" replace />;

  return <>{children}</>;
}

function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const { managerSession, isPlatformAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        載入中…
      </div>
    );
  }

  if (!managerSession) return <Navigate to="/manager/login" replace />;
  if (!isPlatformAdmin) return <Navigate to="/manager/login" replace />;

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  if (profile?.role !== "ADMIN") {
    return <Navigate to={profile ? getDefaultHomePath(profile.role) : "/guest-requests"} replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  return <Navigate to="/home" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/manager/login" element={<ManagerLoginPage />} />
      <Route path="/manager/apply" element={<ManagerApplyPage />} />
      <Route path="/manager/forgot-password" element={<ManagerForgotPasswordPage />} />
      <Route path="/manager/reset-password" element={<ManagerResetPasswordPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/register/complete" element={<CompleteRegistrationPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/guest" element={<GuestScanPage />} />

      <Route
        element={
          <HotelProtectedRoute>
            <Layout />
          </HotelProtectedRoute>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="home" element={<HomePage />} />
        <Route path="engineering" element={<EngineeringDepartmentPage />} />
        <Route path="food-beverage" element={<FoodBeverageDepartmentPage />} />
        <Route path="guest-requests" element={<GuestRequestsPage />} />
        <Route path="housekeeping" element={<HousekeepingDepartmentPage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />

        {/* 舊路徑導向 */}
        <Route path="dashboard" element={<HomeRedirect />} />
        <Route path="tickets" element={<Navigate to="/engineering" replace />} />
        <Route path="service-requests" element={<Navigate to="/housekeeping" replace />} />
        <Route path="logbook" element={<LogbookPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route
          path="qr-rooms"
          element={
            <AdminRoute>
              <QrRoomsPage />
            </AdminRoute>
          }
        />
      </Route>

      <Route
        element={
          <PlatformProtectedRoute>
            <PlatformLayout />
          </PlatformProtectedRoute>
        }
      >
        <Route path="platform/*" element={<Navigate to="/manager" replace />} />
        <Route path="manager" element={<PlatformDashboardPage />} />
        <Route path="manager/inventory" element={<PlatformInventoryPage />} />
        <Route path="manager/costs" element={<PlatformCostLogsPage />} />
        <Route path="manager/users" element={<PlatformUsersPage />} />
        <Route path="manager/tenants/:id" element={<TenantDetailPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
