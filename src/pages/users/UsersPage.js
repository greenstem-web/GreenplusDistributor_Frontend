import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataGrid, { Column, Paging, Scrolling, SearchPanel } from "devextreme-react/data-grid";
import Popup from "devextreme-react/popup";
import Switch from "devextreme-react/switch";
import TextBox from "devextreme-react/text-box";
import LoadPanel from "devextreme-react/load-panel";
import notify from "devextreme/ui/notify";
import { confirm } from "devextreme/ui/dialog";
import * as usersApi from "../../api/users";
import { describeError } from "../../api/baseapi";
import { fromApiDate } from "../../api/analytics";
import FieldError from "../../components/FieldError";
import Icon from "../../components/Icon";
import { PageActions } from "../../layouts/AppShell";
import "../items/items.css";
import "./users.css";

const BLANK = { userId: 0, username: "", email: "", phone: "", isAdmin: false, active: true };

function formatDate(value) {
  const d = fromApiDate(value);
  return d ? d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "";
}

/** dd/mm/yyyy, as in the other listings. */
function formatDay(value) {
  const d = fromApiDate(value);
  return d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : "";
}

function formatTime(value) {
  const d = fromApiDate(value);
  return d ? d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }) : "";
}

/** The username rule the API applies - checked here too so the answer lands next to the field. */
const USERNAME_RULE = /^[A-Za-z0-9._@-]{3,100}$/;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Account >> Users: an admin managing their distributor's logins.
 *
 * Nobody types a password for someone else. A new login is emailed an invitation to set its own
 * password, and a forgotten one is replaced by emailing a set-password link. If the email cannot be
 * sent, the link is shown here instead for the admin to pass on.
 *
 * Only admins reach this page - and the API refuses everyone else regardless. An admin cannot
 * switch off or demote their own login, so the distributor always keeps an admin.
 */
export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // How many rows the search leaves, for the footer.
  const [shown, setShown] = useState(0);

  const [editing, setEditing] = useState(null); // null = closed
  const [saving, setSaving] = useState(false);
  // A refusal that is about no field in particular - at the top. The rest go under their field.
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // The email could not be sent: { username, email, link, reason } for the admin to pass on.
  const [unsent, setUnsent] = useState(null);

  // Bring the first problem into view - Save is at the bottom of the form.
  // Deferred: the popup renders its content after this effect runs, so the message is not there yet.
  useEffect(() => {
    if (!formError && Object.keys(fieldErrors).length === 0) return undefined;
    const timer = setTimeout(
      () =>
        document
          .querySelector(".items-popup .items-form-error, .items-popup .items-field-error")
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      50
    );
    return () => clearTimeout(timer);
  }, [formError, fieldErrors]);

  const fail = useCallback((error, fallback) => {
    notify({ message: describeError(error, fallback).message, type: "error", displayTime: 6000 }, "error", 6000);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    usersApi
      .getUsers()
      .then(setUsers)
      .catch((error) => {
        setUsers([]);
        fail(error, "Could not load the users.");
      })
      .finally(() => setLoading(false));
  }, [fail]);

  useEffect(() => {
    load();
  }, [load]);

  /** Puts a saved row back in the grid, from the server's response. */
  const patch = useCallback((saved) => {
    setUsers((current) =>
      [...current.filter((u) => u.userId !== saved.userId), saved].sort((a, b) => a.username.localeCompare(b.username))
    );
  }, []);

  /** After an invitation or a link: say it was emailed, or hand the link over when it was not. */
  const reportLink = useCallback((result, sentMessage) => {
    if (result.emailSent) {
      notify({ message: sentMessage, type: "success", displayTime: 5000 }, "success", 5000);
    } else {
      setUnsent({ username: result.user.username, email: result.user.email, link: result.link, reason: result.emailError });
    }
  }, []);

  const startAdd = useCallback(() => {
    setFormError(null);
    setFieldErrors({});
    setEditing({ ...BLANK });
  }, []);

  const startEdit = useCallback((row) => {
    setFormError(null);
    setFieldErrors({});
    setEditing({ ...BLANK, ...row, email: row.email || "", phone: row.phone || "" });
  }, []);

  const field = useCallback((name, value) => {
    setEditing((current) => (current ? { ...current, [name]: value } : current));
    // Editing a field answers its message.
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const { [name]: _answered, ...rest } = current;
      return rest;
    });
  }, []);

  const save = useCallback(async () => {
    if (!editing || saving) return;
    const isNew = !editing.userId;
    const email = editing.email.trim();

    // All of them at once, each under its field. The API checks again regardless.
    const problems = {};
    if (!USERNAME_RULE.test(editing.username.trim()))
      problems.username = "3 to 100 characters: letters, numbers and . _ - @ only, no spaces.";
    if (isNew && !email) problems.email = "Required - the invitation to set a password is sent here.";
    else if (email && !EMAIL_RULE.test(email)) problems.email = "This is not a valid email address.";

    setFieldErrors(problems);
    setFormError(null);
    if (Object.keys(problems).length > 0) return;

    setSaving(true);
    const payload = {
      username: editing.username.trim(),
      email,
      phone: editing.phone,
      isAdmin: editing.isAdmin,
      active: editing.active,
    };

    try {
      if (isNew) {
        const result = await usersApi.createUser(payload);
        patch(result.user);
        setEditing(null);
        reportLink(result, `${result.user.username} added. An invitation to set a password was emailed to ${result.user.email}.`);
      } else {
        const saved = await usersApi.updateUser(editing.userId, payload);
        patch(saved);
        setEditing(null);
        notify({ message: `${saved.username} saved.`, type: "success", displayTime: 2500 }, "success", 2500);
      }
    } catch (error) {
      // The API names the field when the refusal is about one (a username already taken, say).
      const message = describeError(error, "Could not save this user.").message;
      const onField = error?.response?.data?.field;
      if (onField) setFieldErrors({ [onField]: message });
      else setFormError(message);
    } finally {
      setSaving(false);
    }
  }, [editing, patch, reportLink, saving]);

  const sendLink = useCallback(
    async (row) => {
      const what = row.invited ? "the invitation again" : "a link to set a new password";
      const yes = await confirm(
        `Email ${what} to <b>${row.username}</b> at <b>${row.email}</b>?` +
          (row.invited ? "" : "<br/><br/>Their current password keeps working until they use the link."),
        row.invited ? "Resend invitation" : "Send password reset link"
      );
      if (!yes) return;

      try {
        const result = await usersApi.sendSetPasswordLink(row.userId);
        patch(result.user);
        reportLink(result, `Link emailed to ${result.user.email}.`);
      } catch (error) {
        fail(error, "Could not send the link.");
      }
    },
    [fail, patch, reportLink]
  );

  const unlock = useCallback(
    async (row) => {
      try {
        patch(await usersApi.unlockUser(row.userId));
        notify({ message: `${row.username} unlocked.`, type: "success", displayTime: 2500 }, "success", 2500);
      } catch (error) {
        fail(error, "Could not unlock this user.");
      }
    },
    [fail, patch]
  );

  const copyLink = useCallback((link) => {
    navigator.clipboard?.writeText(link).then(
      () => notify({ message: "Link copied.", type: "success", displayTime: 1500 }, "success", 1500),
      () => {}
    );
  }, []);

  const renderFlag = useCallback((cell) => {
    const on = cell.value === true;
    return (
      <span className={on ? "items-flag items-flag-on" : "items-flag items-flag-off"}>
        <span className="items-dot" aria-hidden="true" />
        {on ? "Yes" : "No"}
      </span>
    );
  }, []);

  const renderUsername = useCallback(
    (cell) => (
      <span className="users-name">
        <span className="items-code">{cell.value}</span>
        {cell.data.isSelf && <span className="users-you">you</span>}
      </span>
    ),
    []
  );

  // What needs attention, in order: switched off, locked, invitation not yet used.
  const renderStatus = useCallback((cell) => {
    const u = cell.data;
    if (!u.active) return <span className="gp-status">Switched off</span>;
    if (u.isLocked) return <span className="gp-status gp-status-bad">Locked until {formatTime(u.lockedUntil)}</span>;
    if (u.invited) {
      const expired = !u.linkExpiry || fromApiDate(u.linkExpiry) <= new Date();
      return expired ? (
        <span className="gp-status gp-status-bad" title="Send the invitation again">
          Invitation expired
        </span>
      ) : (
        <span className="gp-status gp-status-warn" title={`Sent ${formatDate(u.linkSentDate)}`}>
          Invited
        </span>
      );
    }
    if (u.mustChangePassword) return <span className="gp-status gp-status-warn">Temporary password</span>;
    return <span className="gp-status gp-status-ok">OK</span>;
  }, []);

  const renderActions = useCallback(
    (cell) => {
      const u = cell.data;
      return (
        <div className="items-actions">
          <button type="button" className="items-action items-action-edit" title="Edit" aria-label={`Edit ${u.username}`} onClick={() => startEdit(u)}>
            <Icon name="pencil" size={17} />
          </button>
          {!u.isSelf && u.active && (
            <button
              type="button"
              className="items-action users-action-mail"
              title={u.invited ? "Resend invitation" : "Send password reset link"}
              aria-label={`${u.invited ? "Resend invitation to" : "Send password reset link to"} ${u.username}`}
              onClick={() => sendLink(u)}
            >
              <Icon name="mail" size={17} />
            </button>
          )}
          {u.isLocked && (
            <button type="button" className="items-action users-action-unlock" title="Unlock" aria-label={`Unlock ${u.username}`} onClick={() => unlock(u)}>
              <Icon name="unlock" size={17} />
            </button>
          )}
        </div>
      );
    },
    [sendLink, startEdit, unlock]
  );

  // Remembered from the last time the form was open, so its title does not flip while it fades out.
  const lastIsNew = useRef(false);
  if (editing !== null) lastIsNew.current = !editing.userId;
  const isNew = lastIsNew.current;
  const self = editing?.isSelf;

  const counts = useMemo(
    () => ({
      admin: users.filter((u) => u.isAdmin).length,
      active: users.filter((u) => u.active).length,
      off: users.filter((u) => !u.active).length,
    }),
    [users]
  );

  const onContentReady = useCallback((e) => setShown(e.component.totalCount()), []);

  return (
    <div className="items-page users-page">
      <PageActions>
        <button type="button" className="page-btn page-btn-primary" onClick={startAdd}>
          <Icon name="plus" size={17} strokeWidth={2.2} />
          Add User
        </button>
      </PageActions>

      <div className="items-card">
        <div className="items-toolbar">
          <label className="gp-search">
            <Icon name="search" size={17} />
            <input
              type="search"
              placeholder="Search username or email"
              aria-label="Search username or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <div className="gp-stats">
            <div className="gp-stat gp-stat-blue">
              <span className="gp-stat-value">{users.length}</span>
              <span className="gp-stat-label">Login{users.length === 1 ? "" : "s"}</span>
            </div>
            <div className="gp-stat gp-stat-yellow">
              <span className="gp-stat-value">{counts.admin}</span>
              <span className="gp-stat-label">Admin</span>
            </div>
            <div className="gp-stat gp-stat-green">
              <span className="gp-stat-value">{counts.active}</span>
              <span className="gp-stat-label">Active</span>
            </div>
            <div className="gp-stat gp-stat-grey">
              <span className="gp-stat-value">{counts.off}</span>
              <span className="gp-stat-label">Switched Off</span>
            </div>
          </div>
        </div>

        <div className="items-grid">
          <DataGrid
            className="items-datagrid"
            dataSource={users}
            keyExpr="userId"
            showBorders={false}
            showColumnLines={false}
            showRowLines={false}
            hoverStateEnabled={true}
            columnAutoWidth={false}
            columnHidingEnabled={true}
            noDataText={loading ? "" : search ? "No login matches this search." : "No users."}
            onContentReady={onContentReady}
            height="100%"
          >
            <SearchPanel visible={false} text={search} />
            <Scrolling mode="virtual" />
            <Paging enabled={false} />

            <Column dataField="username" caption="Username" minWidth={180} cellRender={renderUsername} />
            <Column dataField="email" caption="Email" minWidth={200} hidingPriority={2} />
            <Column dataField="phone" caption="Phone" width={150} hidingPriority={0} />
            <Column dataField="isAdmin" caption="Admin" width={130} cellRender={renderFlag} />
            <Column caption="Status" width={190} allowSearch={false} cellRender={renderStatus} />
            <Column
              dataField="passwordChangedDate"
              caption="Password set"
              width={140}
              allowSearch={false}
              hidingPriority={1}
              cellRender={(c) => formatDay(c.data.passwordChangedDate)}
            />
            <Column caption="" width={120} allowSorting={false} allowSearch={false} cellRender={renderActions} />
          </DataGrid>
        </div>

        <div className="items-foot">
          <span>
            Showing {shown.toLocaleString("en-MY")} of {users.length.toLocaleString("en-MY")} login{users.length === 1 ? "" : "s"}
          </span>
          <span>New logins are emailed an invitation to set their own password</span>
        </div>
      </div>

      <Popup
        visible={editing !== null}
        onHiding={() => setEditing(null)}
        title={isNew ? "New user" : "Edit user"}
        width={640}
        maxWidth="94vw"
        height="auto"
        maxHeight="90vh"
        showCloseButton={true}
        dragEnabled={false}
        hideOnOutsideClick={false}
        wrapperAttr={{ class: "items-popup" }}
        contentRender={() =>
          editing && (
            <div className="items-form">
              {formError && (
                <div className="items-form-error" role="alert">
                  {formError}
                </div>
              )}

              <label className="items-label" htmlFor="user-username">
                Username <span className="items-required" aria-hidden="true">*</span>
              </label>
              <TextBox
                inputAttr={{ id: "user-username", autoComplete: "off" }}
                value={editing.username}
                maxLength={100}
                valueChangeEvent="input"
                isValid={!fieldErrors.username}
                onValueChanged={(e) => field("username", e.value || "")}
              />
              <FieldError message={fieldErrors.username} />
              <div className="items-hint">What they sign in with. Letters, numbers and . _ - @, no spaces.</div>

              <div className="items-form-row">
                <div className="items-form-col">
                  <label className="items-label" htmlFor="user-email">
                    Email{isNew && <span className="items-required" aria-hidden="true"> *</span>}
                  </label>
                  <TextBox
                    inputAttr={{ id: "user-email", autoComplete: "off" }}
                    value={editing.email}
                    maxLength={255}
                    valueChangeEvent="input"
                    isValid={!fieldErrors.email}
                    onValueChanged={(e) => field("email", e.value || "")}
                  />
                  <FieldError message={fieldErrors.email} />
                </div>
                <div className="items-form-col">
                  <label className="items-label" htmlFor="user-phone">
                    Phone
                  </label>
                  <TextBox
                    inputAttr={{ id: "user-phone" }}
                    value={editing.phone}
                    maxLength={50}
                    valueChangeEvent="input"
                    isValid={!fieldErrors.phone}
                    onValueChanged={(e) => field("phone", e.value || "")}
                  />
                  <FieldError message={fieldErrors.phone} />
                </div>
              </div>
              {isNew && (
                <div className="items-hint">
                  We email an invitation there with a link to set their own password. It works for 72 hours; you can
                  send it again from the list.
                </div>
              )}

              <div className="items-toggle">
                <Switch value={editing.isAdmin} disabled={self} onValueChanged={(e) => field("isAdmin", e.value)} />
                <div>
                  <div className="items-toggle-label">Admin</div>
                  <div className="items-hint">
                    {self
                      ? "You cannot remove admin from your own login. Ask another admin."
                      : "Can manage users - add them, switch them off and send them password links."}
                  </div>
                </div>
              </div>

              <div className="items-toggle">
                <Switch value={editing.active} disabled={self} onValueChanged={(e) => field("active", e.value)} />
                <div>
                  <div className="items-toggle-label">Active</div>
                  <div className="items-hint">
                    {self
                      ? "You cannot switch off your own login."
                      : "Switching this off signs them out at once and stops them signing in. Their history stays in the audit log."}
                  </div>
                </div>
              </div>

              <div className="items-form-buttons">
                <button type="button" className="page-btn page-btn-muted" disabled={saving} onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="button" className="page-btn page-btn-primary" disabled={saving} onClick={save}>
                  <Icon name={isNew ? "mail" : "check"} size={17} />
                  {saving ? "Saving..." : isNew ? "Add and send invitation" : "Save changes"}
                </button>
              </div>
            </div>
          )
        }
      />

      {/* The email could not be sent. The login and its link exist, so the admin passes the link on. */}
      <Popup
        visible={unsent !== null}
        onHiding={() => setUnsent(null)}
        title="Email not sent"
        width={520}
        height="auto"
        showCloseButton={true}
        dragEnabled={false}
        hideOnOutsideClick={false}
        wrapperAttr={{ class: "items-popup" }}
        contentRender={() =>
          unsent && (
            <div className="items-form">
              <div className="items-form-error" role="alert">
                {unsent.reason}
              </div>
              <div className="users-reset-intro">
                The link for <b>{unsent.username}</b> is ready but could not be emailed to {unsent.email}. Copy it and send
                it to them yourself - it works once, to set their password.
              </div>
              <div className="users-password-row">
                <TextBox value={unsent.link} readOnly={true} inputAttr={{ "aria-label": "Set-password link" }} />
                <button type="button" className="gp-icon-btn users-copy" title="Copy" aria-label="Copy the link" onClick={() => copyLink(unsent.link)}>
                  <Icon name="copy" size={17} />
                </button>
              </div>
              <div className="items-form-buttons">
                <button type="button" className="page-btn page-btn-primary" onClick={() => setUnsent(null)}>
                  Done
                </button>
              </div>
            </div>
          )
        }
      />

      <LoadPanel visible={loading} showPane={true} position={{ of: ".users-page" }} />
    </div>
  );
}
