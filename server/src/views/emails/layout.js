import { escapeHtml } from '../../utils/sanitize.js';

const PALETTE = {
  ink: '#1f2430',
  muted: '#5b6472',
  line: '#e3e7ee',
  page: '#f4f6fa',
  brand: '#7b3fa0',
  danger: '#c62828',
  ok: '#2e7d32',
};

function button(href, label, colour = PALETTE.brand) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
      <tr>
        <td align="center" bgcolor="${colour}" style="border-radius:6px;">
          <a href="${escapeHtml(href)}"
             style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;
                    font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

function detailRow(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `
    <tr>
      <td style="padding:7px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                 color:${PALETTE.muted};width:150px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:7px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;
                 color:${PALETTE.ink};font-weight:bold;">${escapeHtml(value)}</td>
    </tr>`;
}

function detailTable(rows) {
  const body = rows.map(([label, value]) => detailRow(label, value)).join('');
  if (!body.trim()) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="border-collapse:collapse;margin:8px 0 4px;">${body}</table>`;
}

function calloutBox(html, colour = PALETTE.danger, background = '#fdecea') {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="border-collapse:collapse;margin:16px 0;">
      <tr>
        <td style="padding:14px 16px;background:${background};border-left:4px solid ${colour};
                   border-radius:4px;font-family:Arial,Helvetica,sans-serif;font-size:14px;
                   line-height:1.55;color:${PALETTE.ink};">${html}</td>
      </tr>
    </table>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                    line-height:1.6;color:${PALETTE.ink};">${text}</p>`;
}

function wrap({ title, body, accent = PALETTE.brand, preheader = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${PALETTE.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background:${PALETTE.page};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
               style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${PALETTE.line};
                      border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background:${accent};padding:18px 26px;">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:bold;
                           color:#ffffff;letter-spacing:0.3px;">${escapeHtml(title)}</span>
              <span style="float:right;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                           color:rgba(255,255,255,0.85);padding-top:5px;">Nirapod</span>
            </td>
          </tr>
          <tr><td style="padding:26px;">${body}</td></tr>
          <tr>
            <td style="padding:16px 26px;background:#fafbfd;border-top:1px solid ${PALETTE.line};">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                        line-height:1.6;color:${PALETTE.muted};">
                You are receiving this because someone added your address to their Nirapod
                safety network. Nirapod is a community safety app &mdash; it is not an
                emergency service. In a life-threatening situation, call your local
                emergency number.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export { wrap, button, detailTable, calloutBox, paragraph, PALETTE };
