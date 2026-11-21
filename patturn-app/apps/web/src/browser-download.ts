const CONTENT_TYPES: Readonly<Record<string, string>> = {
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  json: 'application/json',
  zip: 'application/zip',
  stl: 'model/stl',
  obj: 'text/plain',
  dxf: 'image/vnd.dxf',
};

/** Unknown/project formats remain opaque binary; never infer from payload contents. */
export function downloadContentType(name: string): string {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return extension && Object.hasOwn(CONTENT_TYPES, extension)
    ? CONTENT_TYPES[extension]!
    : 'application/octet-stream';
}

/** Request only: browsers do not acknowledge the final filesystem write. */
export function requestBrowserDownload(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.slice().buffer], { type: downloadContentType(name) });
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
