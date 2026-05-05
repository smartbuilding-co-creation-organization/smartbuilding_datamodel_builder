export type DownloadInput = string | ArrayBuffer | Uint8Array;

export function downloadFile(content: DownloadInput, filename: string, mimeType: string): void {
  let blob: Blob;
  if (content instanceof Uint8Array) {
    const buffer = new ArrayBuffer(content.byteLength);
    new Uint8Array(buffer).set(content);
    blob = new Blob([buffer], { type: mimeType });
  } else {
    blob = new Blob([content], { type: mimeType });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
