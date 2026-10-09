import nodemailer from "nodemailer";
import { z } from "zod";
// Operator explicitly loads a local secret file using Node --env-file. No sends.
const schema = z.object({
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().max(65535),
  SMTP_TLS_MODE: z.enum(["implicit", "starttls"]),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  MAIL_FROM_ADDRESS: z.email(),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "SMTP-Konfiguration unvollständig: " +
      parsed.error.issues.map((i) => i.path.join(".")).join(", "),
  );
  process.exitCode = 1;
} else {
  const c = parsed.data;
  const transport = nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_TLS_MODE === "implicit",
    requireTLS: c.SMTP_TLS_MODE === "starttls",
    auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  try {
    await transport.verify();
    console.log(
      "SMTP-Verbindung, TLS und Anmeldung erfolgreich geprüft. Keine Nachricht versendet. Absenderfreigabe und Zustellung bleiben ungeprüft.",
    );
  } catch (e) {
    const code = (e as { code?: string }).code;
    console.error(
      "SMTP-Prüfung fehlgeschlagen: " +
        (["EAUTH", "ECONNECTION", "ETIMEDOUT", "EDNS", "ETLS"].includes(
          code ?? "",
        )
          ? code
          : "Verbindungsfehler") +
        ". Keine Nachricht versendet.",
    );
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}
