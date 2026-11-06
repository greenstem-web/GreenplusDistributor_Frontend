import React, { useMemo, useState } from "react";
import TextBox, { Button as TextBoxButton } from "devextreme-react/text-box";

/**
 * A password field with an eye button to show what was typed - every password field on the
 * platform uses it (sign in, My Profile, the set-password page). Takes the same props as TextBox;
 * `mode` is its own. Each field remembers its own show / hide, and starts hidden.
 *
 * The eye is the web accounting's own (public/images/eye-regular.svg and eye-slash-regular.svg,
 * copied from Greenplus_Frontend), so a user of both sees the same thing.
 */
export default function PasswordBox(props) {
  const [shown, setShown] = useState(false);

  const eye = useMemo(
    () => ({
      icon: shown ? "/images/eye-slash-regular.svg" : "/images/eye-regular.svg",
      hint: shown ? "Hide password" : "Show password",
      // Not a tab stop: Tab should go from one password box to the next, not via the eye.
      tabIndex: -1,
      elementAttr: { class: "password-eye", "aria-label": shown ? "Hide password" : "Show password" },
      onClick: () => setShown((current) => !current),
    }),
    [shown]
  );

  return (
    <TextBox {...props} mode={shown ? "text" : "password"}>
      <TextBoxButton name="showPassword" location="after" options={eye} />
    </TextBox>
  );
}
