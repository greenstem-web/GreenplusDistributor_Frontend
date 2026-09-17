import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import TextBox from "devextreme-react/text-box";
import Button from "devextreme-react/button";
import LoadIndicator from "devextreme-react/load-indicator";
import { useAuth } from "../../contexts/auth";
import { describeError } from "../../api/baseapi";
import "./login.css";

export default function LoginPage() {
  const { signIn } = useAuth();
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
        await signIn(username.trim(), password);
        navigate("/catalog", { replace: true });
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
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-title">Greenplus Distributor</h1>
        <p className="login-subtitle">Sign in to manage your catalog</p>

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
        <TextBox
          inputAttr={{ id: "password", autoComplete: "current-password" }}
          mode="password"
          value={password}
          onValueChanged={(e) => setPassword(e.value)}
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
            busy ? <LoadIndicator height={20} width={20} /> : <span>Sign in</span>
          }
        />
      </form>
    </div>
  );
}
