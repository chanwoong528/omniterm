import { useState } from 'react';
import type { SavedSession } from '../types';
import {
  needsBastionPassword,
  needsTargetPassword,
  shouldReuseBastionAuth,
  type SessionPasswords,
} from '../utils/resolveSessionConnection';

const inputClassName =
  'mb-2 w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500';

/**
 * 비밀번호 인증 세션을 쓰기 직전에 비밀번호를 받는 폼. 비밀번호는 저장하지
 * 않으므로 터미널 연결과 포트 포워딩 시작 모두 이 폼을 거친다.
 * (Tauri 웹뷰에서는 window.prompt가 동작하지 않아 인앱 폼이 필요하다.)
 */
export function SessionPasswordForm({
  session,
  submitLabel,
  busyLabel,
  isBusy = false,
  onSubmit,
  onCancel,
}: {
  session: SavedSession;
  submitLabel: string;
  busyLabel: string;
  isBusy?: boolean;
  onSubmit: (passwords: SessionPasswords) => void;
  onCancel: () => void;
}) {
  const [targetPassword, setTargetPassword] = useState('');
  const [bastionPassword, setBastionPassword] = useState('');

  const showTargetPassword = needsTargetPassword(session);
  const showBastionPassword = needsBastionPassword(session);
  const reuseBastionAuth = shouldReuseBastionAuth(session);

  const canSubmit =
    !isBusy &&
    (!showTargetPassword || targetPassword.trim().length > 0) &&
    (!showBastionPassword || bastionPassword.trim().length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      targetPassword: showTargetPassword ? targetPassword : undefined,
      bastionPassword: showBastionPassword ? bastionPassword : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded border border-zinc-600 bg-zinc-800/80 p-3">
      <p className="mb-2 text-xs text-zinc-300">Enter password: {session.label}</p>
      {showTargetPassword && (
        <input
          type="password"
          placeholder="Target password"
          value={targetPassword}
          onChange={(e) => setTargetPassword(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={inputClassName}
          autoComplete="current-password"
          aria-label="Target server password"
        />
      )}
      {showBastionPassword && (
        <input
          type="password"
          placeholder={reuseBastionAuth ? 'Bastion/Target password' : 'Bastion password'}
          value={bastionPassword}
          onChange={(e) => setBastionPassword(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={inputClassName}
          autoComplete="current-password"
          aria-label="Bastion server password"
        />
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-zinc-600 px-2 py-1.5 text-xs text-white hover:bg-zinc-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          tabIndex={0}
        >
          {isBusy ? busyLabel : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          tabIndex={0}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
