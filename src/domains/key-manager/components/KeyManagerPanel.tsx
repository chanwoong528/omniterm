import { useCallback, useState } from 'react';
import { Key, Plus, Trash2 } from 'lucide-react';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import type { RegisteredKeyMeta } from '../types';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

function KeyListItem({
  keyMeta,
  onRemove,
  onLoadToAgent,
}: {
  keyMeta: RegisteredKeyMeta;
  onRemove: () => void;
  onLoadToAgent: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700/50">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Key className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-zinc-200" title={keyMeta.label}>
            {keyMeta.label}
          </p>
          <p className="truncate text-xs text-zinc-500" title={keyMeta.keyType}>
            {keyMeta.keyType}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onLoadToAgent}
          className="rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label={`Load key ${keyMeta.label} to SSH agent`}
        >
          Load to Agent
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-600 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label={`Remove key ${keyMeta.label}`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function KeyManagerPanel() {
  const { registeredKeys, addKey, removeKey } = useKeyManagerStore();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKeyPath, setNewKeyPath] = useState('');
  const [pickKeyError, setPickKeyError] = useState<string | null>(null);
  const [agentLoadKey, setAgentLoadKey] = useState<RegisteredKeyMeta | null>(null);
  const [agentPassphrase, setAgentPassphrase] = useState('');
  const [agentPersistToKeychain, setAgentPersistToKeychain] = useState(true);
  const [agentLoadError, setAgentLoadError] = useState<string | null>(null);
  const [isAgentLoading, setIsAgentLoading] = useState(false);

  const onPickKeyFile = useCallback(async () => {
    setPickKeyError(null);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: 'Select a private key file',
        filters: [
          { name: 'SSH private key', extensions: ['pem', 'key', 'rsa'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (!selected || Array.isArray(selected)) return;
      setNewKeyPath(selected);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open file picker';
      setPickKeyError(message);
    }
  }, []);

  const handleAddKey = () => {
    const trimmedLabel = newLabel.trim();
    const trimmedPath = newKeyPath.trim();
    if (!trimmedLabel || !trimmedPath) return;
    const keyType = trimmedPath.includes('.pem') ? '.pem' : trimmedPath.includes('id_rsa') ? 'id_rsa' : 'key';
    addKey({
      id: crypto.randomUUID(),
      label: trimmedLabel,
      storageKey: trimmedPath,
      keyType,
      createdAt: new Date().toISOString(),
    });
    setNewLabel('');
    setNewKeyPath('');
    setIsAddOpen(false);
  };

  const onRequestLoadToAgent = (keyMeta: RegisteredKeyMeta) => {
    setAgentLoadKey(keyMeta);
    setAgentPassphrase('');
    setAgentLoadError(null);
    setIsAgentLoading(false);
  };

  const onCancelLoadToAgent = () => {
    setAgentLoadKey(null);
    setAgentPassphrase('');
    setAgentLoadError(null);
    setIsAgentLoading(false);
  };

  const onConfirmLoadToAgent = async () => {
    const key = agentLoadKey;
    if (!key || isAgentLoading) return;
    setIsAgentLoading(true);
    setAgentLoadError(null);
    try {
      await invoke('ssh_agent_add_key', {
        payload: {
          keyPath: key.storageKey,
          passphrase: agentPassphrase.trim() ? agentPassphrase : undefined,
          persistToKeychain: agentPersistToKeychain,
        },
      });
      setAgentLoadKey(null);
      setAgentPassphrase('');
      setAgentLoadError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to load key to agent';
      setAgentLoadError(message);
    } finally {
      setIsAgentLoading(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Private keys</h3>
        <button
          type="button"
          onClick={() => setIsAddOpen((prev) => !prev)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label="Add private key"
          aria-expanded={isAddOpen}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add key
        </button>
      </div>

      {isAddOpen && (
        <div className="flex min-w-0 flex-col gap-2 rounded border border-zinc-600 bg-zinc-800/50 p-3">
          <input
            type="text"
            placeholder="Label (e.g. My EC2 key)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Key label"
          />
          <div className="flex min-w-0 gap-2">
            <input
              type="text"
              placeholder="Select a key file…"
              value={newKeyPath}
              readOnly
              onClick={() => void onPickKeyFile()}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                void onPickKeyFile();
              }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 cursor-pointer rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              aria-label="Pick key file"
              tabIndex={0}
            />
            <button
              type="button"
              onClick={() => void onPickKeyFile()}
              className="shrink-0 rounded border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              aria-label="Browse key file"
            >
              Browse
            </button>
          </div>
          {pickKeyError && (
            <p className="text-xs text-red-300" role="alert">
              {pickKeyError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddKey}
              disabled={!newLabel.trim() || !newKeyPath.trim()}
              className="flex-1 rounded bg-zinc-600 py-1.5 text-sm font-medium text-white hover:bg-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddOpen(false);
                setNewLabel('');
                setNewKeyPath('');
              }}
              className="rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {registeredKeys.length === 0 && !isAddOpen ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-sm text-zinc-500">
          <Key className="h-8 w-8 text-zinc-600" aria-hidden />
          <p>No keys registered</p>
          <p className="text-xs">Add a .pem or id_rsa path to use for SSH.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5" aria-label="Registered private keys">
          {registeredKeys.map((keyMeta) => (
            <li key={keyMeta.id}>
              <KeyListItem
                keyMeta={keyMeta}
                onRemove={() => removeKey(keyMeta.id)}
                onLoadToAgent={() => onRequestLoadToAgent(keyMeta)}
              />
            </li>
          ))}
        </ul>
      )}

      {agentLoadKey && (
        <div
          className="rounded border border-zinc-600 bg-zinc-800/80 p-3"
          role="dialog"
          aria-label="Load key to SSH agent"
        >
          <p className="mb-2 text-xs text-zinc-300">
            Load to SSH Agent: <span className="text-zinc-100">{agentLoadKey.label}</span>
          </p>
          <label className="mb-2 flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={agentPersistToKeychain}
              onChange={(e) => setAgentPersistToKeychain(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-zinc-400 focus:ring-zinc-500"
              aria-label="Persist key to macOS Keychain"
            />
            Remember in Keychain (macOS)
          </label>
          <input
            type="password"
            placeholder="Passphrase (optional)"
            value={agentPassphrase}
            onChange={(e) => setAgentPassphrase(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="mb-2 w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="SSH key passphrase"
          />
          {agentLoadError && (
            <p className="mb-2 text-xs text-red-300" role="alert">
              {agentLoadError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void onConfirmLoadToAgent()}
              disabled={isAgentLoading}
              className="rounded bg-zinc-600 px-2 py-1.5 text-xs text-white hover:bg-zinc-500 disabled:opacity-50"
              aria-label="Confirm load key to SSH agent"
            >
              {isAgentLoading ? 'Loading…' : 'Load'}
            </button>
            <button
              type="button"
              onClick={onCancelLoadToAgent}
              className="rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              aria-label="Cancel load key to SSH agent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
