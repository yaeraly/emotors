'use client';

import { ReactNode } from 'react';

type Props = {
  locked: boolean;
  tooltip: string;
  children: ReactNode;
};

export function LockedFieldHint({ locked, tooltip, children }: Props) {
  if (!locked) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute right-3 top-9 z-10 text-slate-500" title={tooltip} aria-label={tooltip}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
        </svg>
      </div>
      {children}
    </div>
  );
}
