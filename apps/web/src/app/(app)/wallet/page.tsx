'use client';

import { useWallet, useWalletTransactions, WalletTransaction } from '@/hooks/use-wallet';

function formatInr(amountInr: string): string {
  const n = parseFloat(amountInr);
  if (isNaN(n)) return amountInr;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TransactionTypeBadge({ type }: { type: WalletTransaction['type'] }) {
  const cls =
    type === 'CREDIT'
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {type}
    </span>
  );
}

export default function WalletPage() {
  const { wallet, loading: walletLoading, error: walletError } = useWallet();
  const { data: transactions, loading: txLoading, error: txError } = useWalletTransactions();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Franchise Wallet</h1>

      {/* Balance card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        {walletLoading ? (
          <p className="text-slate-400">Loading...</p>
        ) : walletError ? (
          <p className="text-red-500 text-sm">{walletError}</p>
        ) : wallet ? (
          <>
            <p className="text-sm text-slate-500 mb-1">Available Balance</p>
            <p className="text-4xl font-bold text-slate-900">
              ₹{formatInr(wallet.balanceInr)}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Last updated:{' '}
              {new Date(wallet.updatedAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </>
        ) : (
          <p className="text-slate-400 text-sm">No wallet data available</p>
        )}
      </div>

      {/* Transaction history */}
      <h2 className="text-base font-semibold text-slate-800 mb-3">Transaction History</h2>

      {txLoading ? (
        <p className="text-slate-400">Loading...</p>
      ) : txError ? (
        <p className="text-red-500 text-sm">{txError}</p>
      ) : transactions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-10 text-center">
          <p className="text-slate-400 text-sm">No transactions yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Description</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Type</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(tx.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{tx.description}</td>
                  <td className="px-4 py-3">
                    <TransactionTypeBadge type={tx.type} />
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium tabular-nums ${
                      tx.type === 'CREDIT' ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {tx.type === 'CREDIT' ? '+' : '-'}₹{formatInr(tx.amountInr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
