import nodemailer from "nodemailer";

type SendUserWelcomeEmailParams = {
  to: string;
  name: string;
  password: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn(
      "[email] SMTP environment variables not fully configured. Emails will be logged to console instead of sent.",
    );
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === "true",
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return cachedTransporter;
}

export async function sendUserWelcomeEmail(params: SendUserWelcomeEmailParams) {
  const transporter = getTransporter();

  const subject = "Your SalesPulse account credentials";
  const text = [
    `Hi ${params.name || "there"},`,
    "",
    "An administrator has created a SalesPulse account for you.",
    "",
    `Login email: ${params.to}`,
    `Temporary password: ${params.password}`,
    "",
    "For security, please sign in and change your password from the Settings page after your first login.",
    "",
    "Best,",
    "SalesPulse",
  ].join("\n");

  const html = text.replace(/\n/g, "<br />");

  if (!transporter) {
    console.log("[email] Would send user welcome email:", {
      to: params.to,
      subject,
      text,
    });
    return;
  }

  await transporter.sendMail({
    to: params.to,
    from: process.env.SMTP_FROM || params.to,
    subject,
    text,
    html,
  });
}

