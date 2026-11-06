import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PasswordBox from "../../components/PasswordBox";
import notify from "devextreme/ui/notify";
import { changePassword, getCurrentUser } from "../../api/auth";
import { describeError } from "../../api/baseapi";
import { fromApiDate } from "../../api/analytics";
import { useAuth } from "../../contexts/auth";
import FieldError from "../../components/FieldError";
import { checkPassword, passwordChecklist } from "../../components/passwordRules";
import Icon from "../../components/Icon";
import "../items/items.css";
import "./account.css";

function formatDate(value) {
  const d = fromApiDate(value);
  return d ? d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : null;
}

/** One label / value line of the details card. A blank value says so rather than leaving a gap. */
function Detail({ label, children }) {
  return (
    <div className="profile-row">
      <dt>{label}</dt>
      <dd>{children || <span className="profile-blank">Not set</span>}</dd>
    </div>
  );
}

/**
 * Account >> My Profile: who you are signed in as, and your password.
 *
 * The details are read-only here - email and phone are kept on the Users screen by your
 * distributor's admins, so there is one place they change.
 *
 * Also where a user lands straight after signing in with a password someone else set (a new login,
 * or an admin's reset) - App.js keeps them here until they choose their own.
 */
export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const forced = !!user?.mustChangePassword;

  // Read fresh: the sign-in response carries only what the menu needs, not the whole profile.
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    getCurrentUser()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  // A refusal about no field in particular (a lock, the API unreachable) - under the form. The
  // rest go under their own field: { currentPassword, newPassword, confirm }.
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  /** Sets a field and drops its message - typing answers it. */
  const edit = useCallback((name, setter) => (e) => {
    setter(e.value || "");
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const { [name]: _answered, ...rest } = current;
      return rest;
    });
  }, []);
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    if (saving) return;

    // All of them at once, each under its field. The API checks again regardless.
    const problems = {};
    if (!current) problems.currentPassword = "Enter your current password.";
    const weak = checkPassword(next, user?.username);
    if (weak) problems.newPassword = weak;
    // NOT "same as the current one" here: what is typed as current is not known to be right until
    // the server checks it, and it checks that FIRST - a wrong current password is the answer, then
    // the rules, then whether the new one was used before.
    if (!weak && next !== confirmNext) problems.confirm = "Does not match the new password.";

    setFieldErrors(problems);
    setError(null);
    if (Object.keys(problems).length > 0) return;

    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirmNext("");
      setProfile((p) => (p ? { ...p, passwordChangedDate: new Date().toISOString(), mustChangePassword: false } : p));
      notify({ message: "Password changed.", type: "success", displayTime: 3000 }, "success", 3000);
      if (forced) {
        updateUser({ mustChangePassword: false });
        navigate("/home", { replace: true });
      }
    } catch (e) {
      // The API names the field when the refusal is about one (a wrong current password, say).
      const message = describeError(e, "Could not change the password.").message;
      const onField = e?.response?.data?.field;
      if (onField) setFieldErrors({ [onField]: message });
      else setError(message);
    } finally {
      setSaving(false);
    }
  }, [confirmNext, current, forced, navigate, next, saving, updateUser, user?.username]);

  const onEnter = useCallback(
    (e) => {
      if (e.event?.key === "Enter") save();
    },
    [save]
  );

  const p = profile || user || {};
  const initial = (p.username || "?").trim().charAt(0);
  // Ticked as the new password meets each rule; the last one only the server can check.
  const checklist = passwordChecklist(next, user?.username);

  return (
    <div className="account-page">
      {forced && (
        <div className="account-banner" role="status">
          Your password was set by someone else. Choose your own password below to continue.
        </div>
      )}

      <div className="account-cards">
        <section className="account-card" aria-labelledby="profile-heading">
          <div className="profile-head">
            <span className="profile-avatar" aria-hidden="true">
              {initial}
            </span>
            <div>
              <h2 id="profile-heading" className="profile-name">
                {p.username}
              </h2>
              <div className="profile-role">
                {p.isAdmin ? "Admin" : "User"} · {p.distributorName}
              </div>
            </div>
          </div>

          <dl className="profile-details">
            <Detail label="Username">{p.username}</Detail>
            <Detail label="Email">{p.email}</Detail>
            <Detail label="Phone">{p.phone}</Detail>
            <Detail label="Distributor">
              {p.distributorName}
              {p.distributorCode && <span className="profile-code">{p.distributorCode}</span>}
            </Detail>
            <Detail label="Role">{p.isAdmin ? "Admin - can manage users" : "User"}</Detail>
            <Detail label="Member since">{formatDate(p.createdDate)}</Detail>
            <Detail label="Password last set">{formatDate(p.passwordChangedDate)}</Detail>
          </dl>
          <div className="items-hint profile-note">
            {p.isAdmin ? (
              <>
                To change your email or phone, edit your login on <Link to="/users">Users</Link>.
              </>
            ) : (
              "To change your email or phone, ask your admin."
            )}
          </div>
        </section>

        <section className="account-card" aria-labelledby="password-heading">
          <div className="account-card-head">
            <span className="card-icon app-tone-orange" aria-hidden="true">
              <Icon name="lock" size={20} />
            </span>
            <h2 id="password-heading" className="account-card-title">
              Change password
            </h2>
          </div>

          <div className="items-form">
            <label className="items-label" htmlFor="pwd-current">
              {forced ? "Password you signed in with" : "Current Password"} <span className="items-required" aria-hidden="true">*</span>
            </label>
            <PasswordBox
              inputAttr={{ id: "pwd-current", autoComplete: "current-password" }}
              value={current}
              valueChangeEvent="input"
              isValid={!fieldErrors.currentPassword}
              onValueChanged={edit("currentPassword", setCurrent)}
              onKeyDown={onEnter}
            />
            <FieldError message={fieldErrors.currentPassword} />

            <label className="items-label" htmlFor="pwd-new">
              New Password <span className="items-required" aria-hidden="true">*</span>
            </label>
            <PasswordBox
              inputAttr={{ id: "pwd-new", autoComplete: "new-password" }}
              value={next}
              maxLength={128}
              valueChangeEvent="input"
              isValid={!fieldErrors.newPassword}
              onValueChanged={edit("newPassword", setNext)}
              onKeyDown={onEnter}
            />
            <FieldError message={fieldErrors.newPassword} />

            <label className="items-label" htmlFor="pwd-confirm">
              Confirm New Password <span className="items-required" aria-hidden="true">*</span>
            </label>
            <PasswordBox
              inputAttr={{ id: "pwd-confirm", autoComplete: "new-password" }}
              value={confirmNext}
              maxLength={128}
              valueChangeEvent="input"
              isValid={!fieldErrors.confirm}
              onValueChanged={edit("confirm", setConfirmNext)}
              onKeyDown={onEnter}
            />
            <FieldError message={fieldErrors.confirm} />

            <ul className="pwd-rules" aria-label="Password rules">
              {checklist.map((r) => (
                <li key={r.label} className={r.met ? "pwd-rule is-met" : r.met === null ? "pwd-rule is-server" : "pwd-rule"}>
                  {r.met === null ? (
                    <span className="pwd-rule-mark" aria-hidden="true" />
                  ) : (
                    <Icon className="pwd-rule-mark" name="check" size={14} strokeWidth={2.6} />
                  )}
                  <span>
                    {r.label}
                    {r.met === null && <span className="pwd-rule-later"> - checked when you save</span>}
                  </span>
                  <span className="sr-only">{r.met ? " (met)" : r.met === null ? "" : " (not yet)"}</span>
                </li>
              ))}
            </ul>

            {error && (
              <div className="items-form-error account-error" role="alert">
                {error}
              </div>
            )}

            <div className="account-actions">
              <button type="button" className="page-btn page-btn-primary" disabled={saving} onClick={save}>
                {saving ? "Saving..." : "Change Password"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
