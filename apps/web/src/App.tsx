import { useState } from 'react';
import { login, setToken, getToken, getRole } from './api/client';
import { OrdersList } from './screens/OrdersList';
import { OrderDetail } from './screens/OrderDetail';
import { StoreCredit } from './components/StoreCredit';

const SEED_USERS = [
  'alice.customer@example.com',
  'bob.merchant@example.com',
  'carol.admin@example.com',
];

export function App() {
  const [who, setWho] = useState<string | null>(getToken() ? 'session' : null);
  const [role, setRole] = useState<string | null>(getRole());
  const [busy, setBusy] = useState(false);
  const [creditNonce, setCreditNonce] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  async function loginAs(email: string): Promise<void> {
    setBusy(true);
    try {
      await login(email);
      setWho(email);
      setRole(getRole());
      setSelectedOrderId(null);
    } finally {
      setBusy(false);
    }
  }

  const canRefund = role === 'merchant' || role === 'admin';

  return (
    <main>
      <h1>Marketplace</h1>
      <div className="loginbar">
        <span className="muted">Dev login:</span>
        {SEED_USERS.map((email) => (
          <button key={email} disabled={busy} onClick={() => loginAs(email)}>
            {email}
          </button>
        ))}
        <button
          onClick={() => {
            setToken(null);
            setWho(null);
            setRole(null);
            setSelectedOrderId(null);
          }}
        >
          Log out
        </button>
      </div>
      {who ? (
        selectedOrderId ? (
          <OrderDetail
            orderId={selectedOrderId}
            canRefund={canRefund}
            onBack={() => setSelectedOrderId(null)}
            onChanged={() => setCreditNonce((n) => n + 1)}
          />
        ) : (
          <>
            {role === 'customer' && <StoreCredit refreshKey={creditNonce} />}
            <OrdersList key={who} onSelect={setSelectedOrderId} />
          </>
        )
      ) : (
        <p className="muted">Pick a user above to load their orders.</p>
      )}
    </main>
  );
}
