import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { checkHealth } from './services/api';

export const App: React.FC = () => {
  const [health, setHealth] = useState<{ ok: boolean; service: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkHealth()
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 flex flex-col items-center justify-center">
        <div className="text-center max-w-2xl">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl mb-4">
            Shorten URLs. <span className="text-indigo-400">Track Analytics.</span>
          </h1>
          <p className="text-slate-400 text-lg mb-8">
            Ultra-fast, privacy-first short links with real-time click tracking and secret
            management tokens. No accounts required.
          </p>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-left">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
              API Connection Status
            </h2>
            {error ? (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-md p-3 text-sm">
                Status: Unable to reach API server ({error})
              </div>
            ) : health ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md p-3 text-sm flex items-center justify-between">
                <span>Status: API Server Online</span>
                <span className="font-mono text-xs">{health.service}</span>
              </div>
            ) : (
              <div className="text-slate-500 text-sm animate-pulse">Connecting to API...</div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default App;
