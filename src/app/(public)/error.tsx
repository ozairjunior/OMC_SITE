'use client';
export default function PublicError({ reset }: { reset: () => void }) { return <div className="mx-auto max-w-md p-12 text-center"><h1 className="text-xl font-bold">Não foi possível carregar esta página.</h1><button onClick={reset} className="mt-4 rounded bg-amber-600 px-4 py-2 text-white">Tentar novamente</button></div>; }
