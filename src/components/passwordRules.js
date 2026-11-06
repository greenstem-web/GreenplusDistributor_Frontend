/**
 * The platform's password rules, checked in the browser so the answer is instant - the API checks
 * the same rules again (Greenplus.Distributor.Core/Services/PasswordPolicy.cs), plus the one only it
 * can: not any of the last 4 passwords. Keep the two in step.
 */

export const PASSWORD_RULES =
  "At least 8 characters, with a letter, a number and a special character (e.g. ! @ # $), and not containing your username. Not one of your last 4 passwords.";

/** Anything that is not a letter, a digit or a space. */
const isSpecial = (c) => !/[\p{L}\p{Nd}\s]/u.test(c);

function join(parts) {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The rules as a checklist for the form, each ticked as the password meets it. The last one only the
 * API can check, so it is never ticked here (`met: null`).
 */
export function passwordChecklist(password, username) {
  const p = password || "";
  const name = (username || "").trim().toLowerCase();
  return [
    { label: "At least 8 characters", met: p.length >= 8 && p.length <= 128 },
    {
      label: "A letter, a number and a special character (e.g. ! @ # $)",
      met: /\p{L}/u.test(p) && /\p{Nd}/u.test(p) && [...p].some(isSpecial),
    },
    { label: "Does not contain your username", met: p.length > 0 && !(name && p.toLowerCase().includes(name)) },
    { label: "Not one of your last 4 passwords", met: null },
  ];
}

/** Null when the password is acceptable; otherwise what is wrong with it. */
export function checkPassword(password, username) {
  if (!password || password.length < 8) return "The password must be at least 8 characters.";
  if (password.length > 128) return "The password can be at most 128 characters.";

  const missing = [];
  if (!/\p{L}/u.test(password)) missing.push("a letter");
  if (!/\p{Nd}/u.test(password)) missing.push("a number");
  if (![...password].some(isSpecial)) missing.push("a special character (e.g. ! @ # $)");
  if (missing.length) return `The password must also contain ${join(missing)}.`;

  if (username && password.toLowerCase().includes(username.trim().toLowerCase()))
    return "The password cannot contain your username.";

  return null;
}
