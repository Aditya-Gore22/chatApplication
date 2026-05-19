import DOMPurify from 'dompurify';

/**
 * Sanitize user-provided text to prevent XSS.
 * Returns a plain string (no HTML tags allowed).
 */
export function sanitizeMessage(text) {
  if (typeof text !== 'string') return '';
  // Strip all HTML, then trim
  const stripped = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return stripped.trim().substring(0, 4096);
}

/**
 * Escape for display inside a <pre> or dangerouslySetInnerHTML if ever needed.
 */
export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
