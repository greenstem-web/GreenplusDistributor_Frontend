import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import TextBox from "devextreme-react/text-box";
import Button from "devextreme-react/button";
import LoadIndicator from "devextreme-react/load-indicator";
import { forgotPassword } from "../../api/auth";
import { describeError } from "../../api/baseapi";
import "./login.css";

/**
 * "Forgot password?": emails a one-hour link to set a new password. The answer is the same whether
 * or not the username or address exists - the API does not say, so neither does this page.
 */
export default function ForgotPasswordPage() {
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);

  const submit = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      if (busy || !login.trim()) return;
      setBusy(true);
      setError(null);
      try {
        setSent(await forgotPassword(login.trim()));
      } catch (err) {
        setError(describeError(err, "Could not send the link. Please try again.").message);
      } finally {
        setBusy(false);
      }
    },
    [busy, login]
  );

  return (
    <div className="login-page">
      <img className="login-logo" src="/images/greenplus-logo.png" alt="Greenplus" />
      <form className="login-card" onSubmit={submit}>
        <span className="login-product">Distributor</span>
        <h1 className="login-title">Forgot password</h1>

        {sent ? (
          <>
            <div className="login-notice" role="status">
              {sent}
            </div>
            <p className="login-subtitle">Not there? Check your spam folder, or ask your admin to send you a link.</p>
          </>
        ) : (
          <>
            <p className="login-subtitle">Enter your username or email address and we will email you a link to set a new password.</p>

            <label className="login-label" htmlFor="forgot-login">
              Username or email
            </label>
            <TextBox
              inputAttr={{ id: "forgot-login", autoComplete: "username" }}
              value={login}
              onValueChanged={(e) => setLogin(e.value || "")}
              valueChangeEvent="input"
              onEnterKey={submit}
              disabled={busy}
              stylingMode="outlined"
            />

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
              disabled={busy || !login.trim()}
              className="login-button"
              render={() =>
                busy ? <LoadIndicator height={20} width={20} /> : <span className="login-button-text">Send link</span>
              }
            />
          </>
        )}

        <Link className="login-link login-link-back" to="/login">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}
