import type { SavedSession } from '../types';

export function partitionSessions(sessions: SavedSession[]): {
  byFolder: Map<string, SavedSession[]>;
  root: SavedSession[];
  folderNames: string[];
} {
  const byFolder = new Map<string, SavedSession[]>();
  const root: SavedSession[] = [];
  for (const session of sessions) {
    if (!session.folder) {
      root.push(session);
      continue;
    }
    const group = byFolder.get(session.folder);
    if (group) {
      group.push(session);
    } else {
      byFolder.set(session.folder, [session]);
    }
  }
  const folderNames = [...byFolder.keys()].sort((a, b) => a.localeCompare(b));
  return { byFolder, root, folderNames };
}

export function flattenPartitioned(
  byFolder: Map<string, SavedSession[]>,
  root: SavedSession[]
): SavedSession[] {
  const folderNames = [...byFolder.keys()].sort((a, b) => a.localeCompare(b));
  return [...folderNames.flatMap((name) => byFolder.get(name) ?? []), ...root];
}

function sameOrderAndFolders(a: SavedSession[], b: SavedSession[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((session, i) => session.id === b[i]?.id && session.folder === b[i]?.folder);
}

/**
 * Move a session into `folder` (`undefined` = root), inserting before `beforeId`
 * (`null` = append to the end of that group).
 */
export function moveSessionInList(
  sessions: SavedSession[],
  sessionId: string,
  destination: { folder: string | undefined; beforeId: string | null }
): SavedSession[] {
  const dragged = sessions.find((s) => s.id === sessionId);
  if (!dragged) return sessions;
  if (destination.beforeId === sessionId) return sessions;

  const without = sessions.filter((s) => s.id !== sessionId);
  const { byFolder, root } = partitionSessions(without);

  const nextFolder = destination.folder;
  const updated: SavedSession = (() => {
    if (dragged.folder === nextFolder) return dragged;
    if (nextFolder) return { ...dragged, folder: nextFolder };
    const rest = { ...dragged };
    delete rest.folder;
    return rest;
  })();

  if (nextFolder === undefined) {
    const group = [...root];
    let insertAt = group.length;
    if (destination.beforeId) {
      const idx = group.findIndex((s) => s.id === destination.beforeId);
      if (idx !== -1) insertAt = idx;
    }
    group.splice(insertAt, 0, updated);
    const next = flattenPartitioned(byFolder, group);
    return sameOrderAndFolders(sessions, next) ? sessions : next;
  }

  const group = [...(byFolder.get(nextFolder) ?? [])];
  let insertAt = group.length;
  if (destination.beforeId) {
    const idx = group.findIndex((s) => s.id === destination.beforeId);
    if (idx !== -1) insertAt = idx;
  }
  group.splice(insertAt, 0, updated);
  const nextByFolder = new Map(byFolder);
  nextByFolder.set(nextFolder, group);
  const next = flattenPartitioned(nextByFolder, root);
  return sameOrderAndFolders(sessions, next) ? sessions : next;
}
