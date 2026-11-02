import 'server-only';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: false });

/** Render admin-authored Markdown to sanitized HTML. Admin content is trusted less than code: it is always sanitized. */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md ?? '', { async: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'img'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'loading'] },
    // pictures may come only from this site (relative addresses): never from another host
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: { img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy' } }), a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }), h1: 'h2', h5: 'h4', h6: 'h4' },
  });
}
