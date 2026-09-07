import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Oliveira Material de Construção - Catálogo Digital',
  description: 'Solicite seu orçamento de materiais de construção de forma simples e rápida.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-50 text-slate-900 antialiased selection:bg-amber-500 selection:text-white">
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}