import nodemailer from "nodemailer";
import "dotenv/config";

let transporter;
export function getMailer() {
  if (!transporter) {
    const user = process.env.SMTP_USER || process.env.MY_EMAIL;
    const pass = process.env.SMTP_PASSWORD || process.env.APP_PASSWORD;
    const port = Number(process.env.SMTP_PORT || 587);
    if (!user || !pass || !Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error("SMTP configuration missing or invalid");
    }
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user, pass },
      pool: true,
      maxConnections: 1,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
  }
  return transporter;
}

export const mailFrom = () => ({
  name: "PostStation",
  address: process.env.SMTP_FROM || process.env.SMTP_USER || process.env.MY_EMAIL,
});

export const closeMailer = () => transporter?.close();
