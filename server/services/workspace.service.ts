import type { PersistedWorkspace } from "@/lib/financial-engine/serialization";
import { deserializeParseResult, serializeParseResult } from "@/lib/financial-engine/serialization";
import { loadWorkspace, saveWorkspace } from "@/server/repositories/workspace.repository";

function sanitizeWorkspaceBlob(workspace: PersistedWorkspace): PersistedWorkspace {
  return {
    version: 2,
    settings: workspace.settings,
    activeFileId: workspace.activeFileId,
    actionLog: workspace.actionLog ?? [],
    taxonomy: workspace.taxonomy,
    ownerEmail: workspace.ownerEmail,
    savedAt: workspace.savedAt,
    files: (workspace.files ?? []).map((file) => ({
      id: file.id,
      fileName: file.fileName,
      uploadedAt: file.uploadedAt,
      isDemo: file.isDemo,
      parseResult: serializeParseResult(deserializeParseResult(file.parseResult)),
    })),
  };
}

export async function getMerchantWorkspace(email: string) {
  const saved = await loadWorkspace(email);
  if (!saved) return null;
  return sanitizeWorkspaceBlob(saved);
}

export async function saveMerchantWorkspace(email: string, workspace: PersistedWorkspace) {
  return saveWorkspace(email, sanitizeWorkspaceBlob(workspace));
}
