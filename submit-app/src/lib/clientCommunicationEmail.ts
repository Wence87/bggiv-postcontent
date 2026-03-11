type ClientCommunicationEmailInput = {
  to: string;
  subject: string;
  message: string;
  editLink: string;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailBody(message: string, editLink: string): { text: string; html: string } {
  const text = `Hello,

We reviewed your submission and some changes are required before publication.

Message from our team:
${message}

You can update your submission using the link below:
${editLink}

Thank you.

BoardGameGiveaways Team`;

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;">
      <p>Hello,</p>
      <p>We reviewed your submission and some changes are required before publication.</p>
      <p><strong>Message from our team:</strong></p>
      <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
      <p>You can update your submission using the link below:</p>
      <p><a href="${escapeHtml(editLink)}" style="display:inline-block;padding:10px 14px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Edit your submission</a></p>
      <p>Thank you.</p>
      <p>BoardGameGiveaways Team</p>
    </div>
  `;

  return { text, html };
}

export async function sendClientCommunicationEmail(input: ClientCommunicationEmailInput): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.CLIENT_COMM_FROM_EMAIL;
  const rawReplyTo = (process.env.RESEND_REPLY_TO || "contact@boardgamegiveaways.com").trim();
  const replyTo = isValidEmail(rawReplyTo) ? rawReplyTo : "contact@boardgamegiveaways.com";

  if (!resendApiKey || !fromEmail) {
    throw new Error("EMAIL_NOT_CONFIGURED");
  }

  const body = buildEmailBody(input.message, input.editLink);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [input.to],
      subject: input.subject,
      text: body.text,
      html: body.html,
      reply_to: replyTo,
      headers: {
        "List-Unsubscribe": `<mailto:${replyTo}>`,
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`EMAIL_SEND_FAILED:${response.status}:${details.slice(0, 400)}`);
  }
}
