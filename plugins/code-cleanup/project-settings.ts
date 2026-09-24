import type { BbPluginApi } from "@get-bb/plugin-sdk";

type ProjectSettings = { enabled: boolean; prompt: string | null };
type Row = { enabled: number; prompt: string | null };

/** Open the host-managed database once per plugin generation. Missing projects are off. */
export function openProjectSettings(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE IF NOT EXISTS project_settings (
      project_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      prompt TEXT
    )`,
  ]);
  const getRow = db.prepare("SELECT enabled, prompt FROM project_settings WHERE project_id = ?");
  const setEnabled = db.prepare(`INSERT INTO project_settings (project_id, enabled)
    VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET enabled = excluded.enabled`);
  const setPrompt = db.prepare(`INSERT INTO project_settings (project_id, prompt)
    VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET prompt = excluded.prompt`);

  return {
    get(projectId: string): ProjectSettings {
      const row = getRow.get(projectId) as Row | undefined;
      return { enabled: row?.enabled === 1, prompt: row?.prompt ?? null };
    },
    setEnabled(projectId: string, enabled: boolean): void {
      setEnabled.run(projectId, enabled ? 1 : 0);
    },
    setPrompt(projectId: string, prompt: string): void {
      setPrompt.run(projectId, prompt);
    },
    resetPrompt(projectId: string): void {
      setPrompt.run(projectId, null);
    },
  };
}

export type ProjectSettingsStore = ReturnType<typeof openProjectSettings>;
