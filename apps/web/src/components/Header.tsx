import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-xl font-bold tracking-tight text-indigo-400">SnipRL</span>
          <span className="text-xs font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">
            v1.0.0
          </span>
        </div>
        <nav className="flex items-center space-x-6 text-sm text-slate-400">
          <a href="/" className="hover:text-slate-200 transition-colors">
            Create Link
          </a>
          <a href="/docs/PRD.md" className="hover:text-slate-200 transition-colors">
            Docs
          </a>
        </nav>
      </div>
    </header>
  );
};
