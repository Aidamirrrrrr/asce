export function collapseAutofocusSelection(element: HTMLInputElement | HTMLTextAreaElement) {
  requestAnimationFrame(() => {
    const { selectionStart, selectionEnd, value } = element;

    if (selectionStart === 0 && selectionEnd === value.length && value.length > 0) {
      element.setSelectionRange(value.length, value.length);
    }
  });
}
