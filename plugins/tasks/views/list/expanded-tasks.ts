import { useEffect, useState } from "react";
import type { ListTreeEntry } from "./lib.js";

export const EXPANDED_TASKS_STORAGE_KEY = "bb-tasks:list-expanded";
export const EXPANDED_TASKS_VERSION = 1 as const;

interface StoredDocumentV1 {
  version: typeof EXPANDED_TASKS_VERSION;
  scopes: Record<string, string[]>;
}

interface ParsedStorage {
  scopes: Record<string, unknown>;
  isFutureVersion: boolean;
}

function readStorage(): ParsedStorage | null {
  try {
    const raw = window.localStorage.getItem(EXPANDED_TASKS_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.version !== "number" ||
      record.version < EXPANDED_TASKS_VERSION ||
      record.scopes === null ||
      typeof record.scopes !== "object" ||
      Array.isArray(record.scopes)
    ) {
      return null;
    }
    return {
      scopes: record.scopes as Record<string, unknown>,
      isFutureVersion: record.version > EXPANDED_TASKS_VERSION,
    };
  } catch {
    return null;
  }
}

function validIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((id): id is string => typeof id === "string")),
  ];
}

export function loadExpandedTasks(scope: string): Set<string> {
  return new Set(validIds(readStorage()?.scopes[scope]));
}

export function storeExpandedTasks(
  scope: string,
  ids: ReadonlySet<string>,
  knownIds: ReadonlySet<string>,
): void {
  try {
    const existing = readStorage();
    if (existing?.isFutureVersion) return;
    const scopes: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(existing?.scopes ?? {})) {
      scopes[key] = validIds(value);
    }
    scopes[scope] = [...ids].filter((id) => knownIds.has(id));
    const document: StoredDocumentV1 = {
      version: EXPANDED_TASKS_VERSION,
      scopes,
    };
    window.localStorage.setItem(
      EXPANDED_TASKS_STORAGE_KEY,
      JSON.stringify(document),
    );
  } catch {}
}

interface SessionToggles {
  filterKey: string | null;
  overrides: ReadonlyMap<string, boolean>;
}

const NO_OVERRIDES: ReadonlyMap<string, boolean> = new Map();

export function useExpandedTasks(
  scope: string,
  filterKey: string | null,
  knownIds: ReadonlySet<string>,
) {
  const [saved, setSaved] = useState(() => loadExpandedTasks(scope));
  useEffect(() => {
    setSaved(loadExpandedTasks(scope));
  }, [scope]);
  const [session, setSession] = useState<SessionToggles>({
    filterKey,
    overrides: NO_OVERRIDES,
  });
  useEffect(() => {
    setSession({ filterKey, overrides: NO_OVERRIDES });
  }, [filterKey]);
  const overrides =
    session.filterKey === filterKey ? session.overrides : NO_OVERRIDES;

  const isExpanded = (entry: ListTreeEntry): boolean =>
    filterKey === null
      ? saved.has(entry.task.id)
      : (overrides.get(entry.task.id) ?? entry.autoExpand);

  const toggle = (entry: ListTreeEntry) => {
    const id = entry.task.id;
    if (filterKey === null) {
      const next = new Set(saved);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      storeExpandedTasks(scope, next, knownIds);
      setSaved(next);
      return;
    }
    setSession({
      filterKey,
      overrides: new Map(overrides).set(id, !isExpanded(entry)),
    });
  };

  return { isExpanded, toggle };
}
