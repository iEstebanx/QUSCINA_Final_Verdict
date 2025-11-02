// Backend/src/shared/email/EmailOTP/mailer.js

const EMAILJS_API = "https://api.emailjs.com/api/v1.0/email/send";

const {
  EMAILJS_SERVICE_ID: SERVICE_ID,
  EMAILJS_TEMPLATE_ID: TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY: PUBLIC_KEY,
  EMAILJS_ACCESS_TOKEN: ACCESS_TOKEN,
  EMAILJS_ALLOWED_ORIGIN: ALLOWED_ORIGIN = "http://localhost:5173",
} = process.env;

function ensureConfigured() {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error(
      "EmailJS not configured: missing EMAILJS_SERVICE_ID / TEMPLATE_ID / PUBLIC_KEY"
    );
  }
}

async function sendOtpEmail(to, code, { appName = "Quscina", expiresMinutes = 10 } = {}) {
  ensureConfigured();

  const res = await fetch(EMAILJS_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: ALLOWED_ORIGIN,
    },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      accessToken: ACCESS_TOKEN,
      template_params: {
        to_email: to,
        passcode: code,
        time: `${expiresMinutes} minutes`,
        app_name: appName,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`EmailJS send failed (${res.status}): ${text || "unknown error"}`);
  }
}

module.exports = { sendOtpEmail };