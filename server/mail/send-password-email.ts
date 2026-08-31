import nodemailer from "nodemailer";

export type MailResult = { ok: true; method: "smtp"; from: string };

function mailConfigured() {
  const user = process.env.MAIL_USER?.trim() || "";
  const pass = (process.env.MAIL_APP_PASSWORD || process.env.MAIL_PASS || "").trim();
  return { user, pass, ready: Boolean(user && pass) };
}

export function isMailConfigured() {
  return mailConfigured().ready;
}

function resetCodeContent(code: string, fullName: string) {
  const greeting = fullName ? `مرحباً ${fullName}،` : "مرحباً،";
  const subject = "كود إعادة تعيين كلمة المرور — Smart Profits";
  const text = `${greeting}

طلبتِ إعادة تعيين كلمة المرور لحساب Smart Profits.

كود التحقق:
${code}

صالح لمدة 15 دقيقة. إذا لم تطلبي هذه الرسالة، تجاهليها.

Smart Profits`;
  const html = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;color:#0b1120">
      <p>${greeting}</p>
      <p>طلبتِ إعادة تعيين كلمة المرور لحساب <strong>Smart Profits</strong>.</p>
      <p>كود التحقق:</p>
      <p style="font-size:20px;font-weight:700;letter-spacing:2px;background:#f3f6fb;padding:12px 16px;border-radius:12px;display:inline-block">${code}</p>
      <p style="color:#5b6b80;font-size:13px">صالح لمدة 15 دقيقة. إذا لم تطلبي هذه الرسالة، تجاهليها.</p>
    </div>
  `;
  return { subject, text, html };
}

export async function sendResetCodeEmail(to: string, code: string, fullName: string): Promise<MailResult> {
  const { user, pass, ready } = mailConfigured();
  if (!ready) {
    throw new Error(
      "بريد الإرسال غير مُعد. ضعي MAIL_USER و MAIL_APP_PASSWORD في ملف .env ثم أعيدي تشغيل الخادم.",
    );
  }

  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.MAIL_PORT || 587),
    secure: false,
    auth: { user, pass },
  });

  const { subject, text, html } = resetCodeContent(code, fullName);
  await transporter.sendMail({
    from: `"Smart Profits" <${user}>`,
    to,
    subject,
    text,
    html,
  });
  return { ok: true, method: "smtp", from: user };
}
