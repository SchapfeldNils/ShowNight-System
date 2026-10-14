export type AccountMailInput = {
  displayName: string;
  actionUrl: string;
  expiresMinutes: number;
};
export type AccountMail = { subject: string; text: string; html: string };

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

function accountMail(
  kind: "confirmation" | "reset",
  input: AccountMailInput,
): AccountMail {
  const url = new URL(input.actionUrl);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    /[\r\n\x00-\x1f\x7f]/.test(input.actionUrl)
  )
    throw new Error("Ungültiger Kontolink.");
  if (
    !Number.isSafeInteger(input.expiresMinutes) ||
    input.expiresMinutes < 1 ||
    typeof input.displayName !== "string" ||
    !input.displayName.trim()
  )
    throw new Error("Ungültige Kontomail.");
  const confirm = kind === "confirmation";
  const title = confirm ? "E-Mail-Adresse bestätigen" : "Passwort zurücksetzen";
  const intro = confirm
    ? "Bestätige diese E-Mail-Adresse für dein ShowNight-Konto. Danach kannst du darüber bei Bedarf dein Kennwort zurücksetzen."
    : "Für dein ShowNight-Konto wurde ein neues Kennwort angefordert. Über den folgenden Link kannst du es selbst festlegen.";
  const button = confirm
    ? "E-Mail-Adresse bestätigen"
    : "Neues Kennwort festlegen";
  const validity = `Der Link gilt ${input.expiresMinutes} ${input.expiresMinutes === 1 ? "Minute" : "Minuten"} und kann nur einmal verwendet werden.`;
  const mfa =
    "Dein zweiter Faktor (MFA) bleibt unverändert. Für geschützte Konten ist die Bestätigung mit dem Authenticator weiterhin erforderlich.";
  const ignore = confirm
    ? "Wenn du diese Bestätigung nicht angefordert hast, ignoriere diese Nachricht. Dein Konto bleibt unverändert."
    : "Wenn du kein neues Kennwort angefordert hast, ignoriere diese Nachricht. Dein bisheriges Kennwort bleibt gültig.";
  const text = `Hallo ${input.displayName},\n\n${intro}\n\n${button}:\n${url.href}\n\n${validity}\n\n${mfa}\n\n${ignore}\n\nShowNight\nDiese Nachricht wurde automatisch erstellt. Kennwörter und MFA-Codes niemals per E-Mail weitergeben.`;
  const name = escapeHtml(input.displayName),
    link = escapeHtml(url.href);
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#10131a;color:#e8eaf0;font-family:Segoe UI,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(title)} · ${escapeHtml(validity)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#10131a;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
<tr><td style="padding:0 8px 24px;font-size:23px;font-weight:700;letter-spacing:1px;color:#cded84;">ShowNight<span style="display:block;font-size:12px;letter-spacing:2px;font-weight:400;color:#bfc7d5;padding-top:5px;">DEIN KONTO</span></td></tr>
<tr><td style="background:#171d28;border:1px solid #3e4657;border-radius:14px;padding:32px 24px;">
<h1 style="margin:0 0 24px;font-size:28px;line-height:1.2;color:#eff1f5;">${escapeHtml(title)}</h1>
<p style="margin:0 0 16px;line-height:1.6;">Hallo ${name},</p>
<p style="margin:0 0 24px;line-height:1.6;color:#d4dbe6;">${escapeHtml(intro)}</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:7px;background:#cded84;"><a href="${link}" style="display:inline-block;padding:14px 20px;font-size:16px;line-height:1.4;font-weight:700;text-decoration:none;color:#16200d;">${escapeHtml(button)}</a></td></tr></table>
<p style="margin:20px 0 24px;font-size:13px;line-height:1.6;color:#bfc7d5;">${escapeHtml(validity)}</p>
<p style="margin:0 0 8px;padding-top:20px;border-top:1px solid #3e4657;font-size:13px;line-height:1.6;color:#bfc7d5;">Falls die Schaltfläche nicht funktioniert, öffne diesen Link:</p>
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;overflow-wrap:anywhere;"><a href="${link}" style="color:#cded84;">${link}</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#d4dbe6;">${escapeHtml(mfa)}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#bfc7d5;">${escapeHtml(ignore)}</p>
</td></tr>
<tr><td style="padding:20px 8px;font-size:12px;line-height:1.6;color:#8f9aac;">Automatische Nachricht von ShowNight.<br>Kennwörter und MFA-Codes niemals per E-Mail weitergeben.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: "ShowNight · " + title, text, html };
}

export const confirmationMail = (input: AccountMailInput): AccountMail =>
  accountMail("confirmation", input);
export const passwordResetMail = (input: AccountMailInput): AccountMail =>
  accountMail("reset", input);
