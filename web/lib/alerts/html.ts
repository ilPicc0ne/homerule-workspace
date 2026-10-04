const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** HTML-escape text for email bodies. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);
