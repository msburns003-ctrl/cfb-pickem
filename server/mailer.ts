// Outgoing email over SMTP (e.g. Gmail with an app password, or any email
// service's SMTP settings). Off unless every setting below is present.
import nodemailer from "nodemailer";

interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

function mailConfig(): MailConfig | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) return null;
  return { host: SMTP_HOST, port: Number(SMTP_PORT) || 587, user: SMTP_USER, pass: SMTP_PASS, from: MAIL_FROM };
}

export function mailEnabled(): boolean {
  return mailConfig() !== null;
}

let transport: nodemailer.Transporter | null = null;

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<void> {
  const config = mailConfig();
  if (!config) throw new Error("Email is not configured");
  transport ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465, // 587 upgrades with STARTTLS
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.pass },
  });
  await transport.sendMail({ from: config.from, to, subject, text, html });
}
