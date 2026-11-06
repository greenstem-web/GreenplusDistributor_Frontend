import React, { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import TextBox from "devextreme-react/text-box";
import PasswordBox from "../../components/PasswordBox";
import Button from "devextreme-react/button";
import LoadIndicator from "devextreme-react/load-indicator";
import { useAuth } from "../../contexts/auth";
import { describeError } from "../../api/baseapi";
import "./login.css";

export default function LoginPage() {
  const { signIn, notice } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      if (busy) return;

      setError(null);
      setBusy(true);

      try {
        const result = await signIn(username.trim(), password);
        if (!result) {
          // Signed in on another device and the user chose not to end that session.
          setError("Login cancelled - the other session is still signed in.");
          return;
        }
        // The dashboard - /catalog is an old address that now lands on Stock & Visibility.
        navigate("/home", { replace: true });
      } catch (err) {
        const described = describeError(err, "Could not sign in.");

        // 423 is a lock, not a bad password. Telling the user to check their credentials here is
        // actively wrong - the credentials may be correct, and another attempt extends the lock.
        if (described.status === 423 && described.retryAfterSeconds) {
          const minutes = Math.ceil(described.retryAfterSeconds / 60);
          setError(`${described.message} Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`);
        } else {
          setError(described.message);
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, navigate, password, signIn, username]
  );

  return (
    // Laid out like the accounting login: logo top left, the soft green wave behind, one card.
    <div className="login-page">
      <img className="login-logo" src="/images/greenplus-logo.png" alt="Greenplus" />
      <form className="login-card" onSubmit={submit}>
        <span className="login-product">Distributor</span>
        <h1 className="login-title">Login</h1>
        <p className="login-subtitle">Sign in to manage your catalog and see how your items are selling.</p>

        {/* valueChangeEvent="input" because DevExtreme TextBox otherwise commits its value on
            blur/Enter only: the Sign in button stays disabled while you type, so the first click
            just blurs the field and is swallowed. Caught this in the browser, not in code review. */}
        <label className="login-label" htmlFor="username">
          Username
        </label>
        <TextBox
          inputAttr={{ id: "username", autoComplete: "username" }}
          value={username}
          onValueChanged={(e) => setUsername(e.value)}
          valueChangeEvent="input"
          disabled={busy}
          stylingMode="outlined"
          placeholder="devtest"
        />

        <label className="login-label" htmlFor="password">
          Password
        </label>
        <PasswordBox
          inputAttr={{ id: "password", autoComplete: "current-password" }}
          value={password}
          onValueChanged={(e) => setPassword(e.value)}
          valueChangeEvent="input"
          onEnterKey={submit}
          disabled={busy}
          stylingMode="outlined"
        />
        <Link className="login-link login-forgot" to="/forgot-password">
          Forgot password?
        </Link>

        {/* Why this browser was signed out (another device signed in, or the session ended) -
            until the user tries again, when the attempt's own result takes over. */}
        {notice && !error && (
          <div className="login-notice" role="status">
            {notice}
          </div>
        )}

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        {/* useSubmitBehavior so Enter submits the form, which is what a password manager expects.

            `render` is a CONSTANT function that switches its own contents, never a prop that
            alternates between a function and undefined: doing the latter makes DevExtreme tear
            down a template React has already unmounted, and the whole page dies with
            "Failed to execute 'removeChild' on 'Node'". It compiles, type-checks and passes
            review - it only fails when the button first goes busy. */}
        <Button
          type="default"
          width="100%"
          height={44}
          useSubmitBehavior={true}
          disabled={busy || !username.trim() || !password}
          className="login-button"
          render={() =>
            busy ? <LoadIndicator height={20} width={20} /> : <span className="login-button-text">Login</span>
          }
        />
      </form>
    </div>
  );
}
