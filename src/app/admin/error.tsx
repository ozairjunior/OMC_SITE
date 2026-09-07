'use client';
export default function AdminError({ reset }: { reset: () => void }) { return <div className="p-12 text-center"><h1 className="text-xl font-bold">Ocorreu um erro no painel.</h1><button onClick={reset} className="mt-4 rounded bg-amber-600 px-4 py-2 text-white">Tentar novamente</button></div>; }
