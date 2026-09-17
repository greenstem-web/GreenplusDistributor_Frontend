import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import Button from "devextreme-react/button";
import { useAuth } from "../contexts/auth";

/**
 * The two screens answer different questions and are deliberately not one screen: Items is what
 * this distributor publishes, Visibility is what one company may use. NavLink rather than a
 * Button, so the current page marks itself without this component tracking the route.
 */
const NAV = [
  { to: "/items", label: "Items" },
  { to: "/catalog", label: "Visibility" },
];

export default function AppShell() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-name">{user?.distributorName || "Greenplus Distributor"}</span>
          <span className="app-brand-sub">Catalog</span>
        </div>
        <nav className="app-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "app-nav-link app-nav-link-active" : "app-nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
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
