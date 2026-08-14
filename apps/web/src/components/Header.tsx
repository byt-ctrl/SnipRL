import React from 'react';

interface HeaderProps {
  apiStatus: 'online' | 'offline' | 'checking';
}

export const Header: React.FC<HeaderProps> = ({ apiStatus }) => {
  return (
    <header className="border-b border-[#1c2233] bg-[#0c0e16]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#00f0b5] to-[#00a87e] flex items-center justify-center font-mono font-bold text-black text-base shadow-sm">
            /&gt;
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-tight text-white font-sans">SnipRL</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#1e2538] text-[#8b949e] border border-[#29324b]">
              v1.0
            </span>
          </div>
        </div>

        {/* Status & Navigation */}
        <div className="flex items-center gap-4">
          {/* Live API Health Signal */}
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono border"
            style={{
              borderColor:
                apiStatus === 'online'
                  ? 'rgba(0, 240, 181, 0.25)'
                  : apiStatus === 'offline'
                    ? 'rgba(255, 77, 79, 0.25)'
                    : 'rgba(139, 148, 158, 0.25)',
              backgroundColor:
                apiStatus === 'online'
                  ? 'rgba(0, 240, 181, 0.08)'
                  : apiStatus === 'offline'
                    ? 'rgba(255, 77, 79, 0.08)'
                    : 'rgba(139, 148, 158, 0.08)',
              color:
                apiStatus === 'online'
                  ? '#00f0b5'
                  : apiStatus === 'offline'
                    ? '#ff7875'
                    : '#8b949e',
            }}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                apiStatus === 'online'
                  ? 'bg-[#00f0b5] animate-pulse'
                  : apiStatus === 'offline'
                    ? 'bg-[#ff4d4f]'
                    : 'bg-[#8b949e]'
              }`}
            />
            <span>
              {apiStatus === 'online'
                ? 'API Active'
                : apiStatus === 'offline'
                  ? 'API Standby'
                  : 'Connecting'}
            </span>
          </div>

          <a
            href="https://github.com/byt-ctrl/SnipRL"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#8b949e] hover:text-white transition-colors flex items-center gap-1.5 font-medium px-2 py-1 rounded hover:bg-[#161b29]"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
};
