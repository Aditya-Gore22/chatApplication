/**
 * Split a File into base64-encoded chunks of `chunkSize` bytes.
 * Returns Promise<string[]>
 */
export async function chunkFile(file, chunkSize = 16384) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result; // ArrayBuffer
      const uint8 = new Uint8Array(buffer);
      const chunks = [];
      for (let offset = 0; offset < uint8.length; offset += chunkSize) {
        const slice = uint8.slice(offset, offset + chunkSize);
        // Convert to base64
        let binary = '';
        slice.forEach((b) => (binary += String.fromCharCode(b)));
        chunks.push(btoa(binary));
      }
      resolve(chunks);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Reassemble base64 chunks into a Blob.
 */
export function reassembleFile(base64Chunks, mimeType) {
  const binary = base64Chunks.map((c) => atob(c)).join('');
  const uint8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8[i] = binary.charCodeAt(i);
  }
  return new Blob([uint8], { type: mimeType });
}

/**
 * Human-readable file size.
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get file type icon emoji.
 */
export function fileTypeIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return '🗜️';
  if (mimeType.includes('text')) return '📝';
  return '📎';
}
