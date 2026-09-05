'use client';

import { useState } from 'react';

export default function KakaoE2ePage() {
  const [secret, setSecret] = useState('');
  const [itemId, setItemId] = useState('');
  const [loanId, setLoanId] = useState('');
  const [result, setResult] = useState('Ready');

  async function run(action: 'connect-current' | 'force-return-check' | 'cleanup') {
    setResult('Running');
    const response = await fetch('/api/e2e/kakao', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-e2e-secret': secret },
      body: JSON.stringify({ action, itemId, loanId }),
    });
    setResult(`${response.status} ${await response.text()}`);
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Kakao production E2E bridge</h1>
      <input aria-label="E2E secret" className="w-full rounded border p-3" onChange={(event) => setSecret(event.target.value)} type="password" value={secret} />
      <input aria-label="Test item ID" className="w-full rounded border p-3" onChange={(event) => setItemId(event.target.value)} value={itemId} />
      <input aria-label="Test loan ID" className="w-full rounded border p-3" onChange={(event) => setLoanId(event.target.value)} value={loanId} />
      <div className="grid gap-2">
        <button className="rounded bg-primary p-3 text-primary-foreground" onClick={() => void run('connect-current')}>Connect current demo owner</button>
        <button className="rounded border p-3" onClick={() => void run('force-return-check')}>Send return check now</button>
        <button className="rounded border p-3" onClick={() => void run('cleanup')}>Clean test item</button>
      </div>
      <output className="block whitespace-pre-wrap rounded bg-muted p-3">{result}</output>
    </main>
  );
}
