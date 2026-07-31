import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { message, open } from '@tauri-apps/plugin-dialog';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import { useSessionStore } from '../../../stores/sessionStore';
import type { SavedSession } from '../types';
import { parseMxtSessions, type ParsedMxtSession } from '../utils/parseMxtSessions';

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** 키 경로 → Key Manager id. 미등록 경로는 파일명을 라벨로 새로 등록한다. */
function ensureKeyRegistered(keyPath: string, keyIdByPath: Map<string, string>): string {
  const existingId = keyIdByPath.get(keyPath);
  if (existingId) return existingId;

  const fileName = keyPath.split(/[\\/]/).pop() ?? keyPath;
  const dotIndex = fileName.lastIndexOf('.');
  const id = createId();
  useKeyManagerStore.getState().addKey({
    id,
    label: dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName,
    storageKey: keyPath,
    keyType: dotIndex > 0 ? fileName.slice(dotIndex) : 'key',
    createdAt: new Date().toISOString(),
  });
  keyIdByPath.set(keyPath, id);
  return id;
}

function toSavedSession(
  parsed: ParsedMxtSession,
  existingId: string | undefined,
  keyIdByPath: Map<string, string>
): SavedSession {
  const targetKeyId = parsed.targetKeyPath
    ? ensureKeyRegistered(parsed.targetKeyPath, keyIdByPath)
    : undefined;
  const bastionKeyId = parsed.bastionKeyPath
    ? ensureKeyRegistered(parsed.bastionKeyPath, keyIdByPath)
    : undefined;

  return {
    id: existingId ?? createId(),
    label: parsed.label,
    folder: parsed.folder ?? undefined,
    target: {
      host: parsed.target.host,
      port: parsed.target.port,
      username: parsed.target.username,
      authMethod: targetKeyId ? 'private_key' : 'password',
      privateKeyId: targetKeyId,
    },
    useBastion: parsed.bastion !== null,
    bastion: parsed.bastion
      ? {
          host: parsed.bastion.host,
          port: parsed.bastion.port,
          username: parsed.bastion.username,
          authMethod: bastionKeyId ? 'private_key' : 'password',
          privateKeyId: bastionKeyId,
        }
      : undefined,
    reuseBastionAuth: Boolean(
      parsed.bastion && parsed.targetKeyPath && parsed.targetKeyPath === parsed.bastionKeyPath
    ),
  };
}

/**
 * MobaXterm에서 export한 .mxtsessions 파일을 저장된 세션으로 가져온다.
 * 키 경로는 Key Manager에 자동 등록되고, 같은 라벨의 세션은 덮어쓴다.
 */
export function ImportMxtSessionsButton() {
  const [isImporting, setIsImporting] = useState(false);

  const onImportClick = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      title: 'Import MobaXterm sessions',
      filters: [
        { name: 'MobaXterm sessions', extensions: ['mxtsessions'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (!selected || Array.isArray(selected)) return;

    setIsImporting(true);
    try {
      const content = await invoke<string>('read_session_import_file', { path: selected });
      const result = parseMxtSessions(content);
      if (!result.ok) {
        await message(result.reason, { title: 'Import failed', kind: 'error' });
        return;
      }

      const keyIdByPath = new Map(
        useKeyManagerStore.getState().registeredKeys.map((k) => [k.storageKey, k.id])
      );
      // 같은 폴더+라벨의 기존 세션은 id를 이어받아 덮어쓴다 (재가져오기 시 중복 방지).
      const { savedSessions, upsertSession } = useSessionStore.getState();
      const keyOf = (folder: string | null | undefined, label: string) =>
        `${folder ?? ''}\u0000${label}`;
      const existingIdByKey = new Map(
        savedSessions.map((s) => [keyOf(s.folder, s.label), s.id])
      );

      for (const parsed of result.sessions) {
        const existingId =
          existingIdByKey.get(keyOf(parsed.folder, parsed.label)) ??
          // 폴더 필드 도입 전 "[폴더] 라벨" 형식으로 저장된 엔트리도 이어받는다.
          existingIdByKey.get(
            keyOf(null, parsed.folder ? `[${parsed.folder}] ${parsed.label}` : parsed.label)
          );
        upsertSession(toSavedSession(parsed, existingId, keyIdByPath));
      }

      const skippedNote =
        result.skippedCount > 0 ? ` (${result.skippedCount} non-SSH entries skipped)` : '';
      await message(`Imported ${result.sessions.length} sessions${skippedNote}.`, {
        title: 'Import complete',
        kind: 'info',
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await message(reason, { title: 'Import failed', kind: 'error' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onImportClick}
      disabled={isImporting}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      aria-label="Import MobaXterm sessions file"
      title="Import MobaXterm .mxtsessions file"
      tabIndex={0}
    >
      <FileDown className="h-3.5 w-3.5" aria-hidden />
      {isImporting ? 'Importing…' : 'Import'}
    </button>
  );
}
