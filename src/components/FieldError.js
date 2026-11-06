import React from "react";

/**
 * A form field's own message, right under it - red, with a warning icon. Pair it with the input's
 * isValid={!errors.field} so the box is outlined to match. Styled by .items-field-error (items.css),
 * which the Items and Users forms both load.
 */
export default function FieldError({ message }) {
  if (!message) return null;
  return (
    <div className="items-field-error" role="alert">
      <i className="dx-icon dx-icon-warning" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
