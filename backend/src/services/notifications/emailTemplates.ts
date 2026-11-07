/**
 * Responsive HTML and Plain-text Email Templates for LifePilot AI.
 */

export interface EmailTemplateData {
  title: string;
  recipientName: string;
  message: string;
  category?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueDate?: string | Date;
  details?: Array<{ label: string; value: string }>;
  actionUrl?: string;
  actionText?: string;
  badgeText?: string;
  badgeColor?: string;
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  LOW: { bg: '#1e3a8a', text: '#93c5fd', border: '#3b82f6' },
  MEDIUM: { bg: '#713f12', text: '#fde047', border: '#eab308' },
  HIGH: { bg: '#7c2d12', text: '#fdba74', border: '#f97316' },
  CRITICAL: { bg: '#7f1d1d', text: '#fca5a5', border: '#ef4444' },
};

export function renderLifePilotEmail(data: EmailTemplateData): { html: string; text: string } {
  const priorityStyle = data.priority ? PRIORITY_COLORS[data.priority] ?? PRIORITY_COLORS.MEDIUM : PRIORITY_COLORS.MEDIUM;
  const actionUrl = data.actionUrl || 'http://localhost:5173/dashboard';
  const actionText = data.actionText || 'Open LifePilot AI';
  const formattedDate = data.dueDate
    ? new Date(data.dueDate).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : undefined;

  // Plain-text fallback
  let text = `LifePilot AI - ${data.title}\n\n`;
  text += `Hi ${data.recipientName},\n\n`;
  text += `${data.message}\n\n`;
  if (data.priority) text += `Priority: ${data.priority}\n`;
  if (data.category) text += `Category: ${data.category}\n`;
  if (formattedDate) text += `Due Date: ${formattedDate}\n`;
  if (data.details) {
    for (const d of data.details) {
      text += `${d.label}: ${d.value}\n`;
    }
  }
  text += `\nView in LifePilot AI: ${actionUrl}\n\n`;
  text += `LifePilot AI - Your Intelligent Academic & Personal Co-Pilot\n`;

  // Responsive HTML email
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.title)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; }
    table { border-spacing: 0; }
    td { padding: 0; }
    img { border: 0; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #0b0f19; padding-bottom: 40px; }
    .main-table { width: 100%; max-width: 600px; margin: 0 auto; background-color: #0f172a; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; }
    .header { background: linear-gradient(135deg, #4c1d95 0%, #1e1b4b 100%); padding: 32px 32px 28px 32px; text-align: left; }
    .brand-title { font-size: 24px; font-weight: 700; color: #ffffff; margin: 0; letter-spacing: -0.5px; }
    .brand-subtitle { font-size: 13px; color: #c4b5fd; margin: 4px 0 0 0; }
    .content { padding: 32px; background-color: #0f172a; }
    .notification-title { font-size: 20px; font-weight: 600; color: #f8fafc; margin: 0 0 16px 0; }
    .message-body { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin: 0 0 24px 0; }
    .details-card { background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 20px; margin-bottom: 28px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 8px; margin-bottom: 8px; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 14px; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #94a3b8; font-weight: 500; }
    .detail-value { color: #f1f5f9; font-weight: 600; text-align: right; }
    .cta-container { text-align: center; margin: 32px 0 16px 0; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4); }
    .footer { padding: 24px 32px; background-color: #0b0f19; text-align: center; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b; line-height: 1.5; }
    .footer a { color: #8b5cf6; text-decoration: none; }
  </style>
</head>
<body>
  <center class="wrapper">
    <table class="main-table" width="100%">
      <!-- Header -->
      <tr>
        <td class="header">
          <table width="100%">
            <tr>
              <td>
                <h1 class="brand-title">LifePilot AI</h1>
                <p class="brand-subtitle">Your Intelligent Academic & Personal Assistant</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td class="content">
          <h2 class="notification-title">${escapeHtml(data.title)}</h2>
          <p class="message-body">
            Hi <strong>${escapeHtml(data.recipientName)}</strong>,<br><br>
            ${escapeHtml(data.message).replace(/\n/g, '<br>')}
          </p>

          <!-- Badges & Details -->
          <div class="details-card">
            <div style="margin-bottom: 12px;">
              ${
                data.priority
                  ? `<span class="badge" style="background-color: ${priorityStyle.bg}; color: ${priorityStyle.text}; border: 1px solid ${priorityStyle.border};">${data.priority} PRIORITY</span>`
                  : ''
              }
              ${
                data.category
                  ? `<span class="badge" style="background-color: #1e1b4b; color: #c4b5fd; border: 1px solid #6366f1;">${escapeHtml(data.category)}</span>`
                  : ''
              }
              ${
                data.badgeText
                  ? `<span class="badge" style="background-color: #064e3b; color: #6ee7b7; border: 1px solid #10b981;">${escapeHtml(data.badgeText)}</span>`
                  : ''
              }
            </div>

            <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
              ${
                formattedDate
                  ? `<tr>
                      <td style="color: #94a3b8; font-weight: 500; border-bottom: 1px solid #334155;">Due / Scheduled:</td>
                      <td style="color: #f1f5f9; font-weight: 600; text-align: right; border-bottom: 1px solid #334155;">${formattedDate}</td>
                    </tr>`
                  : ''
              }
              ${
                data.details
                  ? data.details
                      .map(
                        (d) => `<tr>
                        <td style="color: #94a3b8; font-weight: 500; border-bottom: 1px solid #334155;">${escapeHtml(d.label)}:</td>
                        <td style="color: #f1f5f9; font-weight: 600; text-align: right; border-bottom: 1px solid #334155;">${escapeHtml(d.value)}</td>
                      </tr>`,
                      )
                      .join('')
                  : ''
              }
            </table>
          </div>

          <!-- Action Button -->
          <div class="cta-container">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${actionUrl}" style="height:46px;v-text-anchor:middle;width:220px;" arcsize="20%" stroke="f" fillcolor="#7c3aed">
              <w:anchorlock/>
              <center>
            <![endif]-->
            <a href="${actionUrl}" class="cta-button" target="_blank">${escapeHtml(actionText)} &rarr;</a>
            <!--[if mso]>
              </center>
            </v:roundrect>
            <![endif]-->
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td class="footer">
          <p style="margin: 0 0 8px 0;">
            You received this notification because Gmail notifications are active on your LifePilot AI account.
          </p>
          <p style="margin: 0;">
            <a href="${data.actionUrl ? data.actionUrl.replace(/\/tasks|\/dashboard.*/, '/settings') : 'http://localhost:5173/settings'}">Notification Preferences</a> &bull; 
            LifePilot AI &copy; ${new Date().getFullYear()}
          </p>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
  `.trim();

  return { html, text };
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

