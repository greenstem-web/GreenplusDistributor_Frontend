import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TextBox from "devextreme-react/text-box";
import PasswordBox from "../../components/PasswordBox";
import Button from "devextreme-react/button";
import LoadIndicator from "devextreme-react/load-indicator";
import { getSetPasswordLink, setPassword } from "../../api/auth";
import { describeError } from "../../api/baseapi";
import FieldError from "../../components/FieldError";
import { PASSWORD_RULES, checkPassword } from "../../components/passwordRules";
import "./login.css";

/**
 * Where an emailed link lands: an invitation to a new login, an admin's reset or "Forgot
 * password?". Checks the link first, so an expired one says so before anyone types a password.
 */
export default function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [link, setLink] = useState(null); // { username, distributorName, newLogin }
  const [checking, setChecking] = useState(true);
  const [dead, setDead] = useState(null);

  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [busy, setBusy] = useState(false);
  // A refusal about no field (the link expired meanwhile, the API unreachable) - under the form.
  // The rest go under their field: { newPassword, confirm }.
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [done, setDone] = useState(false);

  /** Sets a field and drops its message - typing answers it. */
  const edit = useCallback(
    (name, setter) => (e) => {
      setter(e.value || "");
      setFieldErrors((current) => {
        if (!current[name]) return current;
        const { [name]: _answered, ...rest } = current;
        return rest;
      });
    },
    []
  );

  useEffect(() => {
    if (!token) {
      setDead("This link is incomplete. Open it again from the email, or ask for a new one.");
      setChecking(false);
      return;
    }
    getSetPasswordLink(token)
      .then(setLink)
      .catch((err) => setDead(describeError(err, "This link cannot be used.").message))
      .finally(() => setChecking(false));
  }, [token]);

  const submit = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      if (busy) return;
      // The API's rules, checked here too so the answer is instant - each under its field.
      const problems = {};
      const weak = checkPassword(next, link?.username);
      if (weak) problems.newPassword = weak;
      else if (next !== confirmNext) problems.confirm = "Does not match the new password.";
      setFieldErrors(problems);
      setError(null);
      if (Object.keys(problems).length > 0) return;

      setBusy(true);
      try {
        await setPassword(token, next);
        setDone(true);
      } catch (err) {
        // The API names the field when it is about the password (its rules, or one used recently).
        const message = describeError(err, "Could not set the password.").message;
        const onField = err?.response?.data?.field;
        if (onField) setFieldErrors({ [onField]: message });
        else setError(message);
      } finally {
        setBusy(false);
      }
    },
    [busy, confirmNext, link?.username, next, token]
  );

  let body;
  if (checking) {
    body = (
      <div className="login-center">
        <LoadIndicator height={32} width={32} />
      </div>
    );
  } else if (dead) {
    body = (
      <>
        <h1 className="login-title">Link not valid</h1>
        <div className="login-error" role="alert">
          {dead}
        </div>
        <Link className="login-link" to="/forgot-password">
          Send me a new link
        </Link>
      </>
    );
  } else if (done) {
    body = (
      <>
        <h1 className="login-title">Password set</h1>
        <div className="login-notice" role="status">
          You can now sign in as <b>{link.username}</b> with your new password.
        </div>
        <Link className="login-button-link" to="/login">
          Go to sign in
        </Link>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="login-title">{link.newLogin ? "Welcome" : "Set a new password"}</h1>
        <p className="login-subtitle">
          {link.newLogin ? "Choose a password for your login at " : "Choose a new password for your login at "}
          <b>{link.distributorName}</b>.
        </p>

        <label className="login-label" htmlFor="set-username">
          Username
        </label>
        <TextBox inputAttr={{ id: "set-username", autoComplete: "username" }} value={link.username} readOnly={true} stylingMode="outlined" />

        <label className="login-label" htmlFor="set-password">
          New password <span className="items-required" aria-hidden="true">*</span>
        </label>
        <PasswordBox
          inputAttr={{ id: "set-password", autoComplete: "new-password" }}
          value={next}
          maxLength={128}
          isValid={!fieldErrors.newPassword}
          onValueChanged={edit("newPassword", setNext)}
          valueChangeEvent="input"
          disabled={busy}
          stylingMode="outlined"
        />
        <FieldError message={fieldErrors.newPassword} />
        <div className="login-hint">{PASSWORD_RULES}</div>

        <label className="login-label" htmlFor="set-confirm">
          Confirm new password <span className="items-required" aria-hidden="true">*</span>
        </label>
        <PasswordBox
          inputAttr={{ id: "set-confirm", autoComplete: "new-password" }}
          value={confirmNext}
          maxLength={128}
          isValid={!fieldErrors.confirm}
          onValueChanged={edit("confirm", setConfirmNext)}
          valueChangeEvent="input"
          onEnterKey={submit}
          disabled={busy}
          stylingMode="outlined"
        />
        <FieldError message={fieldErrors.confirm} />

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        {/* A constant render function - see LoginPage for why. */}
        <Button
          type="default"
          width="100%"
          height={44}
          useSubmitBehavior={true}
          disabled={busy || !next || !confirmNext}
          className="login-button"
          render={() =>
            busy ? <LoadIndicator height={20} width={20} /> : <span className="login-button-text">Set password</span>
          }
        />
      </>
    );
  }

  return (
    <div className="login-page">
      <img className="login-logo" src="/images/greenplus-logo.png" alt="Greenplus" />
      <form className="login-card" onSubmit={submit}>
        <span className="login-product">Distributor</span>
        {body}
      </form>
    </div>
  );
}
