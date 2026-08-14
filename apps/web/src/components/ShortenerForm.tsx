import React, { useState } from 'react';
import type { CreateLinkDTO } from '@sniprl/shared';

interface ShortenerFormProps {
  onSubmit: (data: CreateLinkDTO) => Promise<void>;
  isLoading: boolean;
  errorMessage: string | null;
}

type ExpiryOption = 'none' | '1h' | '24h' | '7d' | '30d';

export const ShortenerForm: React.FC<ShortenerFormProps> = ({
  onSubmit,
  isLoading,
  errorMessage,
}) => {
  const [longUrl, setLongUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customAlias, setCustomAlias] = useState('');
  const [expiresIn, setExpiresIn] = useState<ExpiryOption>('none');
  const [maxClicks, setMaxClicks] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLongUrl(text.trim());
      }
    } catch {
      // Clipboard permissions denied
    }
  };

  const calculateExpiresAt = (option: ExpiryOption): string | undefined => {
    if (option === 'none') return undefined;
    const now = new Date();
    if (option === '1h') now.setHours(now.getHours() + 1);
    if (option === '24h') now.setDate(now.getDate() + 1);
    if (option === '7d') now.setDate(now.getDate() + 7);
    if (option === '30d') now.setDate(now.getDate() + 30);
    return now.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!longUrl.trim()) return;

    let formattedUrl = longUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const payload: CreateLinkDTO = {
      longUrl: formattedUrl,
      customAlias: customAlias.trim() ? customAlias.trim() : undefined,
      expiresAt: calculateExpiresAt(expiresIn),
      maxClicks: maxClicks ? parseInt(maxClicks, 10) : undefined,
      email: email.trim() ? email.trim() : undefined,
      password: password.trim() ? password.trim() : undefined,
    };

    await onSubmit(payload);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full bg-[#121520] border border-[#202738] rounded-2xl p-5 sm:p-7 shadow-2xl transition-all"
    >
      {/* Primary URL Input Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#56617a]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          </div>
          <input
            type="text"
            value={longUrl}
            onChange={(e) => setLongUrl(e.target.value)}
            placeholder="Paste your destination link (e.g. https://github.com/org/repo)..."
            required
            className="w-full bg-[#0a0c12] border border-[#262f44] focus:border-[#00f0b5] rounded-xl pl-11 pr-20 py-3.5 text-sm text-white placeholder-[#56617a] outline-none transition-colors font-sans"
          />
          <button
            type="button"
            onClick={handlePaste}
            className="absolute inset-y-1.5 right-1.5 px-3 rounded-lg text-xs font-mono text-[#8b949e] hover:text-white bg-[#191f2e] hover:bg-[#232b3f] transition-colors flex items-center gap-1"
          >
            <span>Paste</span>
          </button>
        </div>

        <button
          type="submit"
          disabled={isLoading || !longUrl.trim()}
          className="px-6 py-3.5 bg-[#00f0b5] hover:bg-[#00d8a4] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm font-sans shrink-0"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Shortening...</span>
            </>
          ) : (
            <>
              <span>Shorten URL</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </>
          )}
        </button>
      </div>

      {/* Error Message Notice */}
      {errorMessage && (
        <div className="mt-4 p-3 rounded-xl bg-[#ff4d4f]/10 border border-[#ff4d4f]/30 text-[#ff7875] text-xs flex items-center gap-2 font-mono">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Advanced Toggle */}
      <div className="mt-4 pt-3 border-t border-[#1a2130] flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs font-mono text-[#8b949e] hover:text-[#00f0b5] transition-colors flex items-center gap-1.5"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvanced ? 'rotate-90 text-[#00f0b5]' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>Advanced Controls (Custom Alias, Expiry, Limits, Alerts)</span>
        </button>
      </div>

      {/* Advanced Options Accordion */}
      {showAdvanced && (
        <div className="mt-4 pt-4 border-t border-[#1c2333] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Custom Alias */}
          <div>
            <label className="block text-[#8b949e] font-mono text-[11px] mb-1.5">
              Custom Alias (Optional)
            </label>
            <div className="flex rounded-lg bg-[#0a0c12] border border-[#262f44] focus-within:border-[#00f0b5] overflow-hidden">
              <span className="px-2.5 py-2 text-[#56617a] font-mono text-xs border-r border-[#262f44] bg-[#0f121a]">
                /
              </span>
              <input
                type="text"
                value={customAlias}
                onChange={(e) => setCustomAlias(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
                placeholder="my-link"
                className="w-full bg-transparent px-3 py-2 text-white outline-none font-mono text-xs"
              />
            </div>
          </div>

          {/* Expiration Picker */}
          <div>
            <label className="block text-[#8b949e] font-mono text-[11px] mb-1.5">
              Link Expiration
            </label>
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value as ExpiryOption)}
              className="w-full bg-[#0a0c12] border border-[#262f44] focus:border-[#00f0b5] text-white rounded-lg px-3 py-2 outline-none font-mono text-xs"
            >
              <option value="none">Never expires (Permanent)</option>
              <option value="1h">Expires in 1 Hour</option>
              <option value="24h">Expires in 24 Hours</option>
              <option value="7d">Expires in 7 Days</option>
              <option value="30d">Expires in 30 Days</option>
            </select>
          </div>

          {/* Click Limit */}
          <div>
            <label className="block text-[#8b949e] font-mono text-[11px] mb-1.5">
              Max Click Limit (Self-Destruct)
            </label>
            <input
              type="number"
              min="1"
              value={maxClicks}
              onChange={(e) => setMaxClicks(e.target.value)}
              placeholder="e.g. 50 clicks"
              className="w-full bg-[#0a0c12] border border-[#262f44] focus:border-[#00f0b5] rounded-lg px-3 py-2 text-white outline-none font-mono text-xs"
            />
          </div>

          {/* Notification Email */}
          <div>
            <label className="block text-[#8b949e] font-mono text-[11px] mb-1.5">
              Alerts Email (Optional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alert@example.com"
              className="w-full bg-[#0a0c12] border border-[#262f44] focus:border-[#00f0b5] rounded-lg px-3 py-2 text-white outline-none font-mono text-xs"
            />
          </div>

          {/* Password Protection */}
          <div className="sm:col-span-2">
            <label className="block text-[#8b949e] font-mono text-[11px] mb-1.5">
              Access Password (Optional)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave empty for public access"
              className="w-full bg-[#0a0c12] border border-[#262f44] focus:border-[#00f0b5] rounded-lg px-3 py-2 text-white outline-none font-mono text-xs"
            />
          </div>
        </div>
      )}
    </form>
  );
};
