import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-800 bg-slate-900 py-8 text-center text-xs text-slate-500">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p>&copy; {new Date().getFullYear()} SnipRL Platform. All rights reserved.</p>
        <div className="flex space-x-4">
          <a href="/privacy" className="hover:text-slate-400 transition-colors">
            Privacy Policy
          </a>
          <a href="/terms" className="hover:text-slate-400 transition-colors">
            Terms of Service
          </a>
        </div>
      </div>
    </footer>
  );
};
