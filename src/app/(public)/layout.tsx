import { Header } from '@/components/ui/Header';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <><Header /><main className="min-h-screen">{children}</main><footer className="border-t bg-white py-6 text-center text-xs text-slate-500">Oliveira Material de Construção</footer></>;
}
