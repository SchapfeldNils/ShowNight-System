import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { AgentDispatch } from "../../../packages/contracts/src/agent.js";
type Receipt = {
  status: "accepted" | "completed" | "unknown" | "failed";
  evidence:
    | "persisted"
    | "agent-roundtrip"
    | "simulator-no-effect"
    | "interrupted"
    | "capacity";
  observedAt: string;
};
export class Ledger {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,status TEXT NOT NULL,evidence TEXT NOT NULL,observed_at TEXT NOT NULL);",
    );
    this.db
      .prepare(
        "UPDATE receipts SET status='unknown',evidence='interrupted',observed_at=? WHERE status='accepted'",
      )
      .run(new Date().toISOString());
  }
  accept(d: AgentDispatch): { duplicate: boolean; receipt: Receipt } {
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          d.dispatchId,
          d.commandId,
          d.deviceId,
          d.authorityId,
          d.authorityEpoch,
          d.adapter,
          d.action,
          d.parameters,
          d.simulated,
        ]),
      )
      .digest("hex");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old = this.db
        .prepare("SELECT * FROM receipts WHERE id=?")
        .get(d.dispatchId);
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new Error("Dispatchkennung mit anderem Inhalt.");
        this.db.exec("COMMIT");
        return {
          duplicate: true,
          receipt: {
            status: old.status as Receipt["status"],
            evidence: old.evidence as Receipt["evidence"],
            observedAt: old.observed_at as string,
          },
        };
      }
      if (
        Number(this.db.prepare("SELECT count(*) n FROM receipts").get()!.n) >=
        10000
      )
        throw new Error("Empfangsjournal voll. Keine Ausführung.");
      const receipt: Receipt = {
        status: "accepted",
        evidence: "persisted",
        observedAt: new Date().toISOString(),
      };
      this.db
        .prepare("INSERT INTO receipts VALUES(?,?,?,?,?)")
        .run(
          d.dispatchId,
          fingerprint,
          receipt.status,
          receipt.evidence,
          receipt.observedAt,
        );
      this.db.exec("COMMIT");
      return { duplicate: false, receipt };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  complete(d: AgentDispatch): Receipt {
    const receipt: Receipt = {
      status: "completed",
      evidence: d.simulated ? "simulator-no-effect" : "agent-roundtrip",
      observedAt: new Date().toISOString(),
    };
    const r = this.db
      .prepare(
        "UPDATE receipts SET status=?,evidence=?,observed_at=? WHERE id=? AND status='accepted'",
      )
      .run(receipt.status, receipt.evidence, receipt.observedAt, d.dispatchId);
    if (r.changes !== 1)
      throw new Error("Kein eindeutig angenommener Auftrag.");
    return receipt;
  }
  close() {
    this.db.close();
  }
}
