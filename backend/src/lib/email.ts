import nodemailer from "nodemailer";

interface EmailInput {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

let transporter: nodemailer.Transporter | null = null;

function sanitizePassword(value?: string) {
  return value?.replace(/\s+/g, "").trim();
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number.parseInt(process.env.SMTP_PORT?.trim() ?? "", 10);
  const secure = process.env.SMTP_SECURE?.trim()
    ? process.env.SMTP_SECURE?.trim() === "true"
    : port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = sanitizePassword(process.env.SMTP_PASS) || sanitizePassword(process.env.GMAIL_APP_PASSWORD);
  const from = process.env.SMTP_FROM?.trim();

  return {
    host,
    port: Number.isFinite(port) ? port : secure ? 465 : 587,
    secure,
    user,
    pass,
    from,
  };
}

export function isEmailConfigured() {
  const config = getSmtpConfig();
  return !!(config.host && config.user && config.pass && config.from);
}

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const config = getSmtpConfig();
  if (!config.host || !config.user || !config.pass || !config.from) {
    throw new Error("缺少 SMTP 設定，無法寄送 Email 通知");
  }

  if (config.user.toLowerCase().endsWith("@gmail.com") && config.pass.length !== 16) {
    throw new Error("Gmail SMTP 需要 16 碼 App Password，請重新產生後貼到 SMTP_PASS");
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return transporter;
}

export async function sendEmail(input: EmailInput) {
  const config = getSmtpConfig();
  if (!config.from) {
    throw new Error("缺少 SMTP_FROM 設定，無法寄送 Email 通知");
  }

  await getTransporter().sendMail({
    from: config.from,
    to: input.to.join(", "),
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}
