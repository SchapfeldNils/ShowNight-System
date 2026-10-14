// Only the documented read-only query is exposed. No caller supplied scripts or URLs.
export async function virtualDjClock(port: number, bearer: string) {
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !bearer ||
    bearer.length > 512 ||
    /[\r\n]/.test(bearer)
  )
    throw new Error("Lokalen Plugin-Port und Authentifizierungsstring prüfen.");
  const response = await fetch(`http://127.0.0.1:${port}/query`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(3000),
    headers: {
      "Content-Type": "text/plain",
      Authorization: "Bearer " + bearer,
    },
    body: "get_clock",
  });
  if (!response.ok)
    throw new Error(
      "VirtualDJ-Abfrage nicht bestätigt (HTTP " + response.status + ").",
    );
  const reader = response.body!.getReader();
  let bytes = 0,
    text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 1024) throw new Error("Antwort zu groß.");
      text += Buffer.from(chunk.value).toString("utf8");
    }
  } finally {
    await reader.cancel();
  }
  if (!text.trim()) throw new Error("Leere VirtualDJ-Antwort.");
  return {
    evidence: "query-response",
    clock: text.trim(),
    physicalPlaybackProven: false,
  };
}
