import React, { useState } from 'react';
import type { CreateLinkResponse } from '@sniprl/shared';

interface StoredLink extends CreateLinkResponse {
  originalUrl?: string;
  savedAt: number;
}

interface RecentLinksProps {
  links: StoredLink[];
  onClear: () => void;
}

export const RecentLinks: React.FC<RecentLinksProps> = ({ links, onClear }) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = async (shortUrl: string, code: string) => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Ignore
    }
  };

  if (!links || links.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-[#121520] border border-[#202738] rounded-2xl p-5 sm:p-7 shadow-xl mt-6">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1c2333]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-white font-sans">Recent Links</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#1e2538] text-[#00f0b5] border border-[#29324b]">
            {links.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-mono text-[#8b949e] hover:text-[#ff7875] transition-colors"
        >
          Clear History
        </button>
      </div>

      <div className="space-y-2.5">
        {links.map((link) => (
          <div
            key={link.shortCode}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#090b10] border border-[#1e2537] rounded-xl hover:border-[#2a344d] transition-colors text-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <a
                  href={link.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-semibold text-[#00f0b5] hover:underline"
                >
                  {link.shortUrl}
                </a>
              </div>
              {link.originalUrl && (
                <div className="text-[#8b949e] truncate font-sans text-[11px] max-w-md">
                  &rarr; {link.originalUrl}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCopy(link.shortUrl, link.shortCode)}
                className="px-3 py-1.5 rounded-lg bg-[#181f2f] hover:bg-[#232c42] text-[#c9d1d9] font-mono text-xs transition-colors"
              >
                {copiedCode === link.shortCode ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
