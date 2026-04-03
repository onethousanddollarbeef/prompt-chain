import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Humor Flavor Prompt Chain',
  description: 'Manage humor flavors and steps, then generate captions.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="system">
      <body>{children}</body>
    </html>
  );
}
