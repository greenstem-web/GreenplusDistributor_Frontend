/**
 * NumberBox onContentReady: a click past the end of the number puts the caret just before the
 * decimal point ("0|.00"), not after the decimals ("0.00|") - so typing goes into the whole number.
 *
 * DevExtreme already does this when the box is ENTERED. But a click inside a box that is already
 * active fires no focus event, and on a wide box most of it is empty space to the right of the
 * number - the browser then left the caret after the decimals. A click ON the digits is left where
 * it lands, and nothing is ever selected.
 *
 * Usage: <NumberBox ... format="#,##0.00" onContentReady={caretBeforeDecimals} />
 */
export function caretBeforeDecimals(e) {
  const input = e.element?.querySelector("input.dx-texteditor-input");
  // onContentReady runs on every render: attach the listener once per input.
  if (!input || input.dataset.caretBeforeDecimals) return;
  input.dataset.caretBeforeDecimals = "1";

  input.addEventListener("click", () => {
    const { selectionStart, selectionEnd, value } = input;
    // Something selected, or the caret is not at the very end: the click was meant for the digits.
    if (selectionStart !== selectionEnd || selectionStart !== value.length) return;

    const point = value.indexOf(".");
    if (point >= 0) input.setSelectionRange(point, point);
  });
}
