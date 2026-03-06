import { useState } from 'react';
import { Key, Plus, Trash2 } from 'lucide-react';
import { useKeyManagerStore } from '../../../stores/keyManagerStore';
import type { RegisteredKeyMeta } from '../types';

function KeyListItem({
  keyMeta,
  onRemove,
}: {
  keyMeta: RegisteredKeyMeta;
  onRemove: () => void;
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
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-600 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        aria-label={`Remove key ${keyMeta.label}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function KeyManagerPanel() {
  const { registeredKeys, addKey, removeKey } = useKeyManagerStore();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKeyPath, setNewKeyPath] = useState('');

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
            className="min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Key label"
          />
          <input
            type="text"
            placeholder="Path (e.g. ~/.ssh/id_rsa)"
            value={newKeyPath}
            onChange={(e) => setNewKeyPath(e.target.value)}
            className="min-w-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Key file path"
          />
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
              <KeyListItem keyMeta={keyMeta} onRemove={() => removeKey(keyMeta.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
