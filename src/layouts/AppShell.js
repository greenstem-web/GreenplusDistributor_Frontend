import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation, useOutletContext } from "react-router-dom";
import { useAuth } from "../contexts/auth";
import IdleSignOut from "../components/IdleSignOut";
import Icon from "../components/Icon";

/**
 * The menu, grouped the way the accounting app groups its modules. Items is what this distributor
 * publishes; Stock & Visibility is what each company may use and holds - two screens on purpose,
 * they answer different questions. NavLink, so the current page marks itself.
 *
 * `section` + `title` also make the page heading ("Catalog > Items"), so a page never has to
 * repeat its own name. `tone` tints the link's icon tile - each page keeps its own colour.
 */
const NAV = [
  {
    section: "Overview",
    links: [{ to: "/home", label: "Dashboard", icon: "grid", tone: "green", title: "Dashboard", sub: "How your items are selling across the companies that share their sales with you" }],
  },
  {
    section: "Catalog",
    links: [
      { to: "/items", label: "Items", icon: "cube", tone: "blue", title: "Items", sub: "The items you publish to your companies" },
      {
        to: "/companies",
        label: "Stock & Visibility",
        icon: "stack",
        tone: "amber",
        title: "Stock & Visibility",
        sub: "What each company can see, and how much of it they hold",
      },
    ],
  },
  {
    section: "Reports",
    links: [{ to: "/reports", label: "Reports", icon: "document", tone: "purple", title: "Sales Reports", sub: "Print or export your sales figures" }],
  },
  {
    section: "Account",
    links: [
      {
        to: "/users",
        label: "Users",
        icon: "user",
        tone: "pink",
        title: "Users",
        sub: "Who can sign in for your distributor",
        adminOnly: true,
      },
      {
        to: "/audit",
        label: "Audit Log",
        icon: "clock",
        tone: "teal",
        title: "Audit Log",
        sub: "Who changed what in your catalog, visibility and users, and who signed in",
      },
      { to: "/account/profile", label: "My Profile", icon: "userEdit", tone: "orange", title: "My Profile", sub: "Your login details and password" },
    ],
  },
];

/**
 * Drill-down pages, which are not in the menu: they sit under the menu page they are opened from,
 * and the heading becomes "Catalog > Stock & Visibility > <company>". The last part is the
 * record's own name, which only the page knows - it hands it up through the Outlet context.
 */
const DETAILS = [
  { pattern: /^\/companies\/\d+/, section: "Catalog", parent: { to: "/companies", title: "Stock & Visibility" }, title: "Company" },
  { pattern: /^\/items\/\d+/, section: "Catalog", parent: { to: "/items", title: "Items" }, title: "Item" },
];

const COLLAPSE_KEY = "gp-distributor-menu-collapsed";

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

const isNarrow = () => window.matchMedia("(max-width: 900px)").matches;

export default function AppShell() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();

  // Desktop: the menu shrinks to icons and remembers it. Narrow screens: it is a drawer instead,
  // closed by default and after every navigation.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const toggleMenu = () => {
    if (isNarrow()) {
      setDrawerOpen((open) => !open);
      return;
    }
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Not remembered - it still works for this visit.
      }
      return next;
    });
  };

  // The heading a drill-down page supplied, kept with the path it belongs to - so a stale one from
  // the previous record never shows while the next one loads.
  const [heading, setHeadingState] = useState(null);
  // Where a page puts its own buttons - on the right of the title (see PageActions below).
  const [actionsEl, setActionsEl] = useState(null);
  const outletContext = useMemo(
    () => ({ setHeading: (title, sub) => setHeadingState({ path: pathname, title, sub }), actionsEl }),
    [pathname, actionsEl]
  );

  let page = null;
  const detail = DETAILS.find((d) => d.pattern.test(pathname));
  if (detail) {
    const own = heading?.path === pathname ? heading : null;
    page = { section: detail.section, parent: detail.parent, title: own?.title || detail.title, sub: own?.sub };
  } else {
    for (const group of NAV) {
      const link = group.links.find((l) => pathname.startsWith(l.to));
      if (link) page = { section: group.section, ...link };
    }
  }

  // The menu this user sees: Users only for an admin, and only My Profile while they still have to
  // choose their own password (App.js routes everything else there anyway).
  const nav = useMemo(
    () =>
      NAV.map((group) => ({
        ...group,
        links: group.links.filter((l) =>
          user?.mustChangePassword ? l.to === "/account/profile" : !l.adminOnly || user?.isAdmin
        ),
      })).filter((group) => group.links.length > 0),
    [user?.isAdmin, user?.mustChangePassword]
  );

  const distributorName = user?.distributorName || "Greenplus Distributor";
  const initial = (user?.username || distributorName).trim().charAt(0) || "?";

  return (
    <div
      className={
        "app-shell" + (collapsed ? " app-shell-collapsed" : "") + (drawerOpen ? " app-shell-drawer-open" : "")
      }
    >
      <header className="app-header">
        <button
          type="button"
          className="app-menu-btn"
          // One button, two jobs (shrink on desktop, drawer on a phone), so a neutral name.
          aria-label="Show or hide the menu"
          onClick={toggleMenu}
        >
          <i className="dx-icon dx-icon-menu" aria-hidden="true" />
        </button>

        <NavLink to="/home" className="app-logo" aria-label="Greenplus Distributor home">
          <img className="app-logo-mark" src="/images/greenplus-logo.png" alt="Greenplus Accounting" />
        </NavLink>

        <div className="app-header-spacer" />

        <div className="app-user">
          <button type="button" className="app-logout" onClick={signOut}>
            Logout
          </button>
          <span className="app-divider" aria-hidden="true" />
          <span className="app-company" title={distributorName}>
            <i className="dx-icon dx-icon-globe" aria-hidden="true" />
            <span className="app-company-name">{distributorName}</span>
          </span>
          <Link className="app-profile-link" to="/account/profile" title="My Profile">
            <span className="app-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="app-username">{user?.username}</span>
          </Link>
        </div>
      </header>

      <aside className="app-side" aria-label="Main menu">
        <nav className="app-nav">
          {nav.map((group) => (
            <React.Fragment key={group.section}>
              <div className="app-nav-section">{group.section}</div>
              {group.links.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => (isActive ? "app-nav-link app-nav-link-active" : "app-nav-link")}
                >
                  <span className={`app-nav-icon app-tone-${item.tone}`}>
                    <Icon name={item.icon} size={17} />
                  </span>
                  <span className="app-nav-label">{item.label}</span>
                </NavLink>
              ))}
            </React.Fragment>
          ))}
        </nav>
        <div className="app-side-foot">© {new Date().getFullYear()} Greenplus Accounting</div>
      </aside>

      <div className="app-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <main className="app-main">
        {page && (
          <div className="app-page-head">
            <div>
              <h1 className="app-path">
                <span className="app-path-parent">{page.section}</span>
                <Icon className="app-path-sep" name="chevronRight" size={14} />
                {page.parent && (
                  <>
                    <Link className="app-path-parent app-path-link" to={page.parent.to}>
                      {page.parent.title}
                    </Link>
                    <Icon className="app-path-sep" name="chevronRight" size={14} />
                  </>
                )}
                <span className="app-path-current">{page.title}</span>
              </h1>
              {page.sub && <div className="app-page-sub">{page.sub}</div>}
            </div>
            <div className="app-page-actions" ref={setActionsEl} />
          </div>
        )}
        <div className="app-page-body">
          <Outlet context={outletContext} />
          {/* Signs out after 30 minutes without activity, with a minute's warning. */}
          <IdleSignOut />
        </div>
      </main>
    </div>
  );
}

/**
 * A page's own buttons ("Add item"), shown on the right of the page title. Rendered by the page, so
 * they keep the page's state and handlers; the shell only gives them a place.
 */
export function PageActions({ children }) {
  const { actionsEl } = useOutletContext() || {};
  return actionsEl ? createPortal(children, actionsEl) : null;
}
