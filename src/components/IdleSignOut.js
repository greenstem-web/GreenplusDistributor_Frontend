import React, { useCallback, useEffect, useRef, useState } from "react";
import Popup from "devextreme-react/popup";
import Button from "devextreme-react/button";
import { useAuth } from "../contexts/auth";
import "./IdleSignOut.css";

/** Minutes without activity before signing out. REACT_APP_IDLE_MINUTES overrides it (e.g. per deployment). */
const IDLE_MINUTES = Number(process.env.REACT_APP_IDLE_MINUTES) > 0 ? Number(process.env.REACT_APP_IDLE_MINUTES) : 30;
const IDLE_MS = IDLE_MINUTES * 60 * 1000;

/** The warning comes up this long before the sign-out, with a countdown. */
const WARN_MS = 60 * 1000;

/**
 * Shared by every tab of this browser, so working in one tab keeps the others signed in - they all
 * use the same session.
 */
const LAST_ACTIVITY_KEY = "distributor.lastActivity";

/** Activity is written at most this often - mousemove fires constantly. */
const WRITE_EVERY_MS = 5 * 1000;

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll"];

function readLastActivity() {
  try {
    return Number(window.localStorage.getItem(LAST_ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastActivity(time) {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(time));
  } catch {
    // Storage blocked: this tab still times out on its own activity.
  }
}

/**
 * Signs the user out after IDLE_MINUTES (30 by default) without any activity - for a PC left
 * signed in. A minute before, a warning counts down with "Stay signed in"; letting it run out signs
 * out on the server too (the session ends, as with Logout) and the login page says why.
 *
 * Activity is any mouse, keyboard, touch or scroll input, in ANY tab of the platform in this
 * browser. Mounted inside the signed-in shell only, so it never runs on the login page.
 */
export default function IdleSignOut() {
  const { signOut } = useAuth();
  const [secondsLeft, setSecondsLeft] = useState(null); // null = no warning showing
  const lastLocal = useRef(Date.now());
  const lastWritten = useRef(0);
  const signingOut = useRef(false);

  // Any input counts as activity - except while the warning is up, where only the buttons answer,
  // so a stray mouse move does not quietly dismiss it.
  const warning = secondsLeft !== null;
  const warningRef = useRef(false);
  warningRef.current = warning;

  const markActive = useCallback(() => {
    const now = Date.now();
    lastLocal.current = now;
    if (now - lastWritten.current >= WRITE_EVERY_MS) {
      lastWritten.current = now;
      writeLastActivity(now);
    }
  }, []);

  useEffect(() => {
    markActive(); // signing in or opening the page is activity
    const onActivity = () => {
      if (!warningRef.current) markActive();
    };
    ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, onActivity, { passive: true, capture: true }));
    return () => ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, onActivity, { capture: true }));
  }, [markActive]);

  useEffect(() => {
    const tick = () => {
      if (signingOut.current) return;

      // The latest activity of any tab.
      const last = Math.max(lastLocal.current, readLastActivity());
      const idle = Date.now() - last;

      if (idle >= IDLE_MS) {
        signingOut.current = true;
        setSecondsLeft(null);
        signOut(`You were signed out after ${IDLE_MINUTES} minutes without activity. Please log in again.`);
      } else if (idle >= IDLE_MS - WARN_MS) {
        setSecondsLeft(Math.max(1, Math.ceil((IDLE_MS - idle) / 1000)));
      } else if (warningRef.current) {
        // Another tab was used meanwhile - the warning here is no longer true.
        setSecondsLeft(null);
      }
    };

    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [signOut]);

  const stay = useCallback(() => {
    lastWritten.current = 0; // write now, so the other tabs see it straight away
    markActive();
    setSecondsLeft(null);
  }, [markActive]);

  const leave = useCallback(() => {
    signingOut.current = true;
    setSecondsLeft(null);
    signOut();
  }, [signOut]);

  return (
    <Popup
      visible={warning}
      onHiding={stay}
      title="Still there?"
      width={380}
      height="auto"
      showCloseButton={false}
      dragEnabled={false}
      hideOnOutsideClick={false}
      wrapperAttr={{ class: "idle-popup" }}
      contentRender={() => (
        <div className="idle-body" role="alertdialog" aria-live="assertive">
          <div className="idle-count" aria-hidden="true">
            {secondsLeft}
          </div>
          <p className="idle-text">
            You have been inactive for a while. For your security you will be signed out in{" "}
            <b>
              {secondsLeft} second{secondsLeft === 1 ? "" : "s"}
            </b>
            .
          </p>
          <div className="idle-buttons">
            <Button text="Sign out now" stylingMode="outlined" onClick={leave} />
            <Button text="Stay signed in" type="default" onClick={stay} />
          </div>
        </div>
      )}
    />
  );
}
