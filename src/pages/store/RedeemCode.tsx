// Redeem an access code → unlocks a bundle for the signed-in user (via the
// redeem-code Edge Function). Shown on the storefront.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { redeemCode } from '@/db/repo';
import { useAuth } from '@/auth/AuthProvider';

export function RedeemCode() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!session) return null; // codes are redeemed by signed-in users

  async function submit() {
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const { bundleId } = await redeemCode(code);
      setDone('Unlocked! Opening your bundle…');
      setCode('');
      setTimeout(() => navigate(`/store/${bundleId}`), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-6 space-y-2 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Ticket size={16} className="text-ink-400" /> Have an access code?
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input flex-1 font-mono tracking-wider"
          placeholder="Enter code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && code.trim() && void submit()}
        />
        <button className="btn-primary" onClick={() => void submit()} disabled={busy || !code.trim()}>
          {busy ? 'Redeeming…' : 'Redeem'}
        </button>
      </div>
      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {done && <p className="text-sm text-emerald-600 dark:text-emerald-400">{done}</p>}
    </div>
  );
}
