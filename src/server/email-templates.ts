const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface EmailParts {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  details?: [string, string][];
  footnote?: string;
}

/** Plain, robust HTML email in the St. Chris identity (ember, charcoal, paper). */
export function emailTemplate(p: EmailParts): { body: string; html: string } {
  const text = [
    p.heading,
    '',
    ...p.paragraphs,
    ...(p.details ? ['', ...p.details.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(p.cta ? ['', `${p.cta.label}: ${p.cta.url}`] : []),
    ...(p.footnote ? ['', p.footnote] : []),
    '',
    '— St. Chris Global Limited',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#F3F1EC;font-family:Arial,Helvetica,sans-serif;color:#211E1B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3dfd6">
<tr><td style="background:#211E1B;border-bottom:4px solid #F96D11;padding:18px 28px;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.5px">ST. CHRIS <span style="color:#F96D11">GLOBAL</span> <span style="font-size:11px;font-weight:normal;letter-spacing:3px;opacity:.85">LIMITED</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${esc(p.heading)}</h1>
${p.paragraphs.map((x) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${esc(x)}</p>`).join('')}
${p.details ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;width:100%;border-top:1px solid #e3dfd6">${p.details.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e3dfd6;font-size:13px;color:#5D5750;width:38%">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #e3dfd6;font-size:14px">${esc(v)}</td></tr>`).join('')}</table>` : ''}
${p.cta ? `<p style="margin:20px 0"><a href="${esc(p.cta.url)}" style="background:#F96D11;color:#211E1B;text-decoration:none;padding:12px 22px;font-size:14px;font-weight:bold;display:inline-block">${esc(p.cta.label)}</a></p>` : ''}
${p.footnote ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#5D5750">${esc(p.footnote)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;background:#F3F1EC;font-size:11px;color:#5D5750">St. Chris Global Limited · Nigeria</td></tr>
</table></td></tr></table></body></html>`;
  return { body: text, html };
}
