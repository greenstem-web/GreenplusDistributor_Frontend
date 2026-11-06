import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import config from "devextreme/core/config";
import LoadIndicator from "devextreme-react/load-indicator";
import { AuthProvider, useAuth } from "./contexts/auth";
import AppShell from "./layouts/AppShell";
import LoginPage from "./pages/login/LoginPage";
import ItemsPage from "./pages/items/ItemsPage";
import HomePage from "./pages/home/HomePage";
import ReportsPage from "./pages/reports/ReportsPage";
import CompanyItemsPage from "./pages/company-items/CompanyItemsPage";
import CompanyDetailPage from "./pages/detail/CompanyDetailPage";
import ItemDetailPage from "./pages/detail/ItemDetailPage";
import AuditLogPage from "./pages/audit/AuditLogPage";
import ProfilePage from "./pages/account/ProfilePage";
import UsersPage from "./pages/users/UsersPage";
import ForgotPasswordPage from "./pages/login/ForgotPasswordPage";
import SetPasswordPage from "./pages/login/SetPasswordPage";
import { licenseKey } from "./devextreme-license";

if (licenseKey) config({ licenseKey });

/** Redirects an old Visibility / Stock address to the combined page, keeping its ?status filter. */
function ToCompanies() {
  const { search } = useLocation();
  return <Navigate to={`/companies${search}`} replace />;
}

/**
 * Routes are chosen from the auth state rather than guarded per route: an unauthenticated visitor
 * gets exactly one route, so a new page cannot be added and accidentally left reachable. It mirrors
 * the API, where the authorization fallback policy protects everything unless told otherwise.
 */
function Shell() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  // An emailed set-password link opens the same page signed in or not - e.g. an admin trying a new
  // login's invitation in their own browser. It needs no session; the token in the link is the key.
  if (pathname === "/set-password") return <SetPasswordPage />;

  if (loading) {
    return (
      <div className="app-booting">
        <LoadIndicator height={40} width={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Signed in with a password someone else set (a new login, or an admin's reset): My Profile, where
  // the password is changed, is the only page until they choose their own.
  if (user.mustChangePassword) {
    return (
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/account/profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/account/profile" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Home first: how the published items are selling is what a distributor opens the
            platform to see. Items is where the work starts once they want to change something. */}
        <Route path="/home" element={<HomePage />} />
        <Route path="/items" element={<ItemsPage />} />
        {/* Drill-downs: one item across every company, one company across every item. */}
        <Route path="/items/:itemId" element={<ItemDetailPage />} />
        {/* Visibility and Stock are one page now; the old addresses still land on it. */}
        <Route path="/companies" element={<CompanyItemsPage />} />
        <Route path="/companies/:companyId" element={<CompanyDetailPage />} />
        <Route path="/catalog" element={<ToCompanies />} />
        <Route path="/stock" element={<ToCompanies />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/account/profile" element={<ProfilePage />} />
        <Route path="/account/password" element={<Navigate to="/account/profile" replace />} />
        {/* Admins only - and the API refuses everyone else regardless. */}
        <Route path="/users" element={user.isAdmin ? <UsersPage /> : <Navigate to="/home" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
