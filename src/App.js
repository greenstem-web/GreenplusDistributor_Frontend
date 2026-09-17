import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import config from "devextreme/core/config";
import LoadIndicator from "devextreme-react/load-indicator";
import { AuthProvider, useAuth } from "./contexts/auth";
import AppShell from "./layouts/AppShell";
import LoginPage from "./pages/login/LoginPage";
import CatalogPage from "./pages/catalog/CatalogPage";
import ItemsPage from "./pages/items/ItemsPage";
import { licenseKey } from "./devextreme-license";

if (licenseKey) config({ licenseKey });

/**
 * Routes are chosen from the auth state rather than guarded per route: an unauthenticated visitor
 * gets exactly one route, so a new page cannot be added and accidentally left reachable. It mirrors
 * the API, where the authorization fallback policy protects everything unless told otherwise.
 */
function Shell() {
  const { user, loading } = useAuth();

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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Items first because it is where the work starts: there is nothing to make visible to a
            company until something has been published. */}
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/items" replace />} />
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
