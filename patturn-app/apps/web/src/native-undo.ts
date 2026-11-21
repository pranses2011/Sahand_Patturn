/** Range inputs have no text-undo stack; number/text fields must keep browser editing undo. */
export function preserveNativeUndo(
  tagName: string,
  inputType: string | null,
  contentEditable: boolean,
): boolean {
  if (contentEditable) return true;
  const tag = tagName.toUpperCase();
  return (
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (tag === 'INPUT' && inputType?.toLowerCase() !== 'range')
  );
}
