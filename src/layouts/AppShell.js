import React from "react";
import { Outlet } from "react-router-dom";
import Button from "devextreme-react/button";
import { useAuth } from "../contexts/auth";

export default function AppShell() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-name">{user?.distributorName || "Greenplus Distributor"}</span>
          <span className="app-brand-sub">Catalog</span>
        </div>
        <div className="app-user">
          <span className="app-username">{user?.username}</span>
          <Button text="Sign out" stylingMode="text" onClick={signOut} />
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
