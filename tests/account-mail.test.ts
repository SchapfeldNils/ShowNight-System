import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmationMail,
  passwordResetMail,
} from "../apps/api/src/account-mail.js";

const input = {
  displayName: "Synthetische Leitung",
  actionUrl:
    "https://shownight.example.test/konto?token=synthetic&purpose=confirm",
  expiresMinutes: 15,
};
test("Kontomails: deutsche HTML-/Textvarianten mit sichtbarem Link, MFA und unbeauftragtem Vorgang", () => {
  const confirmation = confirmationMail(input),
    reset = passwordResetMail(input);
  assert.equal(confirmation.subject, "ShowNight · E-Mail-Adresse bestätigen");
  assert.equal(reset.subject, "ShowNight · Passwort zurücksetzen");
  for (const mail of [confirmation, reset]) {
    assert.match(mail.html, /<html lang="de">/);
    assert.match(mail.html, /max-width:600px/);
    assert.match(mail.html, /#cded84/);
    assert.match(mail.html, /15 Minuten/);
    assert.match(mail.text, /MFA.*unverändert/);
    assert.match(mail.html, /Authenticator weiterhin erforderlich/);
    assert.match(mail.text, /ignoriere diese Nachricht/);
    assert.ok(mail.text.includes(input.actionUrl));
    assert.match(mail.html, /Falls die Schaltfläche nicht funktioniert/);
    assert.equal((mail.html.match(/href=/g) ?? []).length, 2);
    assert.doesNotMatch(
      mail.html,
      /<img|<script|<iframe|url\(|src=|@import|<form/i,
    );
    assert.doesNotMatch(mail.subject, /[\r\n]/);
  }
  assert.match(reset.text, /bisheriges Kennwort bleibt gültig/);
  assert.match(
    confirmationMail({ ...input, expiresMinutes: 1 }).text,
    /1 Minute und/,
  );
});
test("Kontomails: HTML-Variablen und URL werden maskiert, aktive fremde Inhalte nicht eingebettet", () => {
  const mail = confirmationMail({
    ...input,
    displayName: `<script>&\"'`,
    actionUrl:
      "https://shownight.example.test/konto?token=synthetic&purpose=<confirm>",
  });
  assert.ok(mail.html.includes("&lt;script&gt;&amp;&quot;&#39;"));
  assert.doesNotMatch(mail.html, /<script>/);
  assert.ok(mail.html.includes("&amp;purpose="));
  assert.ok(mail.text.includes(`<script>&\"'`));
  for (const actionUrl of [
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:secret@example.test/",
    "https://example.test/\r\nInjected",
  ])
    assert.throws(() => passwordResetMail({ ...input, actionUrl }));
  for (const expiresMinutes of [0, -1, 1.5, Infinity])
    assert.throws(() => confirmationMail({ ...input, expiresMinutes }));
});
