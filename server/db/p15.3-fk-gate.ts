import { join } from "node:path";
import { auditSqlIsReadOnly } from "@/server/db/postgres-audit";
import {
  classifyLiveOrphans,
  orphanSqlIsReadOnly,
  type OrphanClassifyReport,
} from "@/server/db/orphan-classify";

export function fkGateMarkerPath() {
  return join(process.cwd(), "data", ".p15.3-fk-gate");
}

export type FkGateItem = {
  id: string;
  proposed: string;
  blockedByRows: number;
  blockedByEmails: number;
  class: string;
  needs: string;
  addNow: false;
};

export type WorkspaceCasPlan = {
  applyNow: false;
  reason: string;
  wouldNeed: string[];
};

export const WORKSPACE_CAS_PLAN: WorkspaceCasPlan = {
  applyNow: false,
  reason:
    "saveWorkspace overwrites the whole JSONB payload. Compare-and-swap on updated_at or payload.savedAt would require the client to send an expected version, which changes the POST /api/workspace contract. P15.3 does not apply it.",
  wouldNeed: [
    "Client sends expectedSavedAt or expectedUpdatedAt",
    "UPDATE … WHERE updated_at = $expected (or payload->>'savedAt') returning rowCount",
    "409 when rowCount is 0 — new API error shape",
  ],
};

export type FkGateReport = {
  evaluatedAt: string;
  postgresMutated: false;
  rowsDeleted: 0;
  foreignKeysAdded: 0;
  uniqueConstraintsAdded: 0;
  items: FkGateItem[];
  workspaceCas: WorkspaceCasPlan;
  unknownOrphans: number;
  go: "wait-for-fk-go";
};

export function fkGateFromOrphans(orphans: OrphanClassifyReport): FkGateReport {
  const workspaceEmails = orphans.workspaceOrphans.length;
  const guardEmails = orphans.guardOrphans.length;
  const guardRows = orphans.guardOrphans.reduce((sum, row) => sum + row.n, 0);
  return {
    evaluatedAt: new Date().toISOString(),
    postgresMutated: false,
    rowsDeleted: 0,
    foreignKeysAdded: 0,
    uniqueConstraintsAdded: 0,
    items: [
      {
        id: "fk-workspaces-email",
        proposed: "workspaces.email → merchants.email",
        blockedByRows: workspaceEmails,
        blockedByEmails: workspaceEmails,
        class: "p12.2-workspace-fixture",
        needs: "Explicit delete GO for p12.2-alice@test.com and p12.2-bob@test.com, or an FK that allows unmatched emails. Do not add in P15.3.",
        addNow: false,
      },
      {
        id: "fk-guard-email",
        proposed: "guard_decisions.email → merchants.email",
        blockedByRows: guardRows,
        blockedByEmails: guardEmails,
        class: "p125-guard-harness",
        needs: "Explicit delete GO for 52 p125-*@test.com guard rows (33 emails), or an FK that allows unmatched emails. Do not add in P15.3.",
        addNow: false,
      },
      {
        id: "unique-phone",
        proposed: "UNIQUE (merchants.payload->>'phone')",
        blockedByRows: 0,
        blockedByEmails: 0,
        class: "none-known",
        needs: "P15.1 found 0 duplicate phones, but adding UNIQUE still needs a separate GO. Do not add in P15.3.",
        addNow: false,
      },
    ],
    workspaceCas: WORKSPACE_CAS_PLAN,
    unknownOrphans: orphans.unknownCount,
    go: "wait-for-fk-go",
  };
}

export async function runFkGate(client: {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}): Promise<{ orphans: OrphanClassifyReport; gate: FkGateReport }> {
  if (!orphanSqlIsReadOnly()) {
    throw new Error("P15.3 refuse: orphan SQL is not read-only.");
  }
  const orphans = await classifyLiveOrphans(client);
  return { orphans, gate: fkGateFromOrphans(orphans) };
}

export function fkGateSqlIsReadOnly() {
  return orphanSqlIsReadOnly() && auditSqlIsReadOnly("SELECT 1");
}
