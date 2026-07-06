'use client';

import type { ReactNode } from 'react';

export type SectionTab = {
  id: string;
  label: string;
};

type Props = {
  tabs: SectionTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  action?: ReactNode;
};

export function SectionTopNav({ tabs, activeTab, onTabChange, action }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={
                active
                  ? 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm'
                  : 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700'
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </div>
  );
}
