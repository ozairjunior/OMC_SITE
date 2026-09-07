import Link from 'next/link';
export default function NotFound() { return <div className="p-16 text-center"><h1 className="text-3xl font-bold">Página não encontrada</h1><Link href="/produtos" className="mt-4 inline-block text-amber-700 underline">Voltar ao catálogo</Link></div>; }
