// Backend/src/lib/mailer.js
// Node 18+ has global fetch; add fallback for Node <18
const _fetch = (typeof fetch !== "undefined") ? fetch : (...args) => import("node-fetch").then(m => m.default(...args));

const EMAILJS_API = "https://api.emailjs.com/api/v1.0/email/send";

const SERVICE_ID   = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID  = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY   = process.env.EMAILJS_PUBLIC_KEY;
const ACCESS_TOKEN = process.env.EMAILJS_ACCESS_TOKEN || null;

function ensureConfigured() {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error("EmailJS not configured: set EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY");
  }
}

/**
 * Sends OTP email. Variable names match your EmailJS template:
 *  - {{to_email}}  (also use this in the template's “To email” field)
 *  - {{passcode}}
 *  - {{time}}      (e.g. '15 minutes')
 *  - {{app_name}}  (optional)
 */
async function sendOtpEmail(to, code, { appName = "Quscina", expiresMinutes = 10 } = {}) {
  ensureConfigured();

  const body = {
    service_id: SERVICE_ID,
    template_id: TEMPLATE_ID,
    user_id: PUBLIC_KEY,
    accessToken: ACCESS_TOKEN || undefined,
    template_params: {
      to_email: to,
      passcode: code,                    // <— matches {{passcode}}
      time: `${expiresMinutes} minutes`, // <— matches {{time}}
      app_name: appName,
    },
  };

  const res = await _fetch(EMAILJS_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // IMPORTANT: must match the domain you allowed in EmailJS
      origin: process.env.EMAILJS_ALLOWED_ORIGIN || "http://localhost:5173",
    },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,           // public key
      accessToken: ACCESS_TOKEN,     // private key
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