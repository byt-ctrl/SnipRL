import React, { useState } from 'react';
import type { CreateLinkResponse } from '@sniprl/shared';

interface ResultCardProps {
  result: CreateLinkResponse;
  onReset: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, onReset }) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const copyToClipboard = async (text: string, type: 'url' | 'token') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div className="w-full bg-[#121520] border border-[#263147] rounded-2xl p-6 sm:p-7 shadow-2xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1c2333] mb-5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[#00f0b5]/10 text-[#00f0b5] flex items-center justify-center">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <span className="font-semibold text-sm text-white font-sans">Short Link Generated</span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-mono text-[#8b949e] hover:text-white transition-colors flex items-center gap-1"
        >
          <span>Create New</span>
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>

      {/* Primary Result Box */}
      <div className="bg-[#090b10] border border-[#263044] rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <div className="font-mono text-base sm:text-lg font-semibold text-[#00f0b5] truncate select-all">
          {result.shortUrl}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => copyToClipboard(result.shortUrl, 'url')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              copiedUrl
                ? 'bg-[#00f0b5] text-black font-semibold'
                : 'bg-[#1e2638] hover:bg-[#28334b] text-white'
            }`}
          >
            {copiedUrl ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5 text-[#8b949e]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span>Copy URL</span>
              </>
            )}
          </button>
          <a
            href={result.shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-xs font-mono bg-[#192030] hover:bg-[#232c42] text-[#8b949e] hover:text-white transition-colors"
            title="Visit URL"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </div>

      {/* Secret Management Token Vault Box */}
      <div className="bg-[#181c28] border border-[#2b354d] rounded-xl p-4 text-xs font-sans">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[#ffc069] font-medium font-mono text-[11px] uppercase tracking-wider">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
            <span>Secret Management Token</span>
          </div>
          <span className="text-[10px] font-mono text-[#8b949e]">Shown only once</span>
        </div>

        <p className="text-[#8b949e] text-[11px] mb-3 leading-relaxed">
          Save this secret key. It grants ownership of this link to view analytics, update
          destination, or delete without an account.
        </p>

        <div className="flex items-center gap-2 bg-[#0a0c12] border border-[#242b3b] rounded-lg p-2 font-mono">
          <input
            type="text"
            readOnly
            value={result.managementToken}
            className="w-full bg-transparent text-[#e2e8f0] outline-none text-xs truncate select-all"
          />
          <button
            type="button"
            onClick={() => copyToClipboard(result.managementToken, 'token')}
            className="px-2.5 py-1 rounded bg-[#20283a] hover:bg-[#2b364e] text-white text-[11px] shrink-0 transition-colors"
          >
            {copiedToken ? 'Copied Token!' : 'Copy Key'}
          </button>
        </div>
      </div>
    </div>
  );
};
