import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-[#1a2030] bg-[#090a0f] py-8 text-xs text-[#8b949e]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-white font-semibold">SnipRL</span>
          <span className="text-[#3a445e]">/</span>
          <span>High-Performance URL Engine</span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-6 font-mono text-[11px]">
          <span>Fastify + PostgreSQL + Redis</span>
          <span>MIT Licensed</span>
        </div>
      </div>
    </footer>
  );
};
