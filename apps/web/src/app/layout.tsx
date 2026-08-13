import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/useTranslation';
import { ToastProvider } from '@/components/ToastProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'EMOTORS OS CRM',
  description: 'Phase 1 CRM for EMOTORS OS',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ky">
      <body>
        <I18nProvider>
          {children}
          <ToastProvider />
        </I18nProvider>
      </body>
    </html>
  );
}
