import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ShortenerForm } from './components/ShortenerForm';
import { ResultCard } from './components/ResultCard';
import { RecentLinks } from './components/RecentLinks';
import { checkHealth, createShortLink } from './services/api';
import type { CreateLinkDTO, CreateLinkResponse } from '@sniprl/shared';

interface StoredLink extends CreateLinkResponse {
  originalUrl?: string;
  savedAt: number;
}

const STORAGE_KEY = 'sniprl_recent_links';

export const App: React.FC = () => {
  const [apiStatus, setApiStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<CreateLinkResponse | null>(null);
  const [recentLinks, setRecentLinks] = useState<StoredLink[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    checkHealth()
      .then((res) => {
        if (res.ok) {
          setApiStatus('online');
        } else {
          setApiStatus('offline');
        }
      })
      .catch(() => setApiStatus('offline'));
  }, []);

  const handleCreateLink = async (payload: CreateLinkDTO) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await createShortLink(payload);
      setCurrentResult(response);

      // Save to local storage history
      const newEntry: StoredLink = {
        ...response,
        originalUrl: payload.longUrl,
        savedAt: Date.now(),
      };

      const updatedList = [
        newEntry,
        ...recentLinks.filter((item) => item.shortCode !== response.shortCode),
      ].slice(0, 10);
      setRecentLinks(updatedList);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
      } catch {
        // Storage full or unavailable
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate short link. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setRecentLinks([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-[#e2e8f0] flex flex-col justify-between font-sans">
      <Header apiStatus={apiStatus} />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-16 flex flex-col items-center">
        {/* Hero Section */}
        <div className="text-center mb-8 sm:mb-10 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#151926] border border-[#26314a] text-xs font-mono text-[#8b949e] mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00f0b5]"></span>
            <span>Base62 Engine &bull; Zero Account Overhead</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
            Fast, deterministic URL shortener with secret key management.
          </h1>
          <p className="text-sm sm:text-base text-[#8b949e] leading-relaxed">
            Convert long links into minimal 7-character Base62 short codes. Retain full ownership
            and access live click telemetry using cryptographic management tokens.
          </p>
        </div>

        {/* Primary Interaction Area */}
        <div className="w-full space-y-6">
          {currentResult ? (
            <ResultCard result={currentResult} onReset={() => setCurrentResult(null)} />
          ) : (
            <ShortenerForm
              onSubmit={handleCreateLink}
              isLoading={isLoading}
              errorMessage={errorMessage}
            />
          )}

          {/* History */}
          <RecentLinks links={recentLinks} onClear={handleClearHistory} />
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default App;
