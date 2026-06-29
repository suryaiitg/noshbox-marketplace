import { useEffect, useState } from 'react';
import { getStoreCredit } from '../api/client';
import { Money } from './Money';

/** Shows the signed-in user's store-credit balance (sum of their ledger entries). */
export function StoreCredit({ refreshKey = 0 }: { refreshKey?: number }) {
  const [cents, setCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStoreCredit()
      .then((value) => {
        if (!cancelled) setCents(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (error) {
    return null;
  }
  if (cents === null) {
    return <p className="muted">Store credit: ...</p>;
  }
  return (
    <p>
      Store credit: <Money cents={cents} />
    </p>
  );
}
