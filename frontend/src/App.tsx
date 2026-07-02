import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PlatformLayout } from "./components/PlatformLayout";
import { useAuth } from "./context/AuthContext";
import { AssetsPage } from "./pages/AssetsPage";
import { CostLogsPage } from "./pages/CostLogsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LandingPage } from "./pages/LandingPage";
import { AuthCallbackPage, CompleteRegistrationPage } from "./pages/AuthCallbackPage";
import { LogbookPage } from "./pages/LogbookPage";
import { GuestRequestsPage } from "./pages/GuestRequestsPage";
import { GuestScanPage } from "./pages/GuestScanPage";
import { QrRoomsPage } from "./pages/QrRoomsPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ServiceRequestsPage } from "./pages/ServiceRequestsPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketsPage } from "./pages/TicketsPage";
import { UsersPage } from "./pages/UsersPage";
import { PlatformDashboardPage } from "./pages/platform/PlatformDashboardPage";
import { TenantDetailPage } from "./pages/platform/TenantDetailPage";

function HotelProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, isPlatformAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        載入中…
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (isPlatformAdmin && !profile) return <Navigate to="/platform" replace />;
  if (!profile) return <Navigate to="/register/complete" replace />;

  return <>{children}</>;
}

function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isPlatformAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        載入中…
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (!isPlatformAdmin) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  if (profile?.role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
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
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="service-requests" element={<ServiceRequestsPage />} />
        <Route path="guest-requests" element={<GuestRequestsPage />} />
        <Route path="logbook" element={<LogbookPage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="costs" element={<CostLogsPage />} />
        <Route
          path="qr-rooms"
          element={
            <AdminRoute>
              <QrRoomsPage />
            </AdminRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <UsersPage />
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
        <Route path="platform" element={<PlatformDashboardPage />} />
        <Route path="platform/tenants/:id" element={<TenantDetailPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
