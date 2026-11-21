/** Request only: browsers do not acknowledge the final filesystem write. */
export function requestBrowserDownload(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/octet-stream' });
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  let requested = false;
  try {
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    requested = true;
  } finally {
    // Failed setup/click must not strand a Blob URL (and its potentially large payload).
    if (requested) setTimeout(() => URL.revokeObjectURL(url), 1000);
    else URL.revokeObjectURL(url);
  }
}
