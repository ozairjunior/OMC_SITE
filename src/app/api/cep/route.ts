import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const cep = new URL(request.url).searchParams.get('cep')?.replace(/\D/g, '') || '';
  if (!/^\d{8}$/.test(cep)) return NextResponse.json({ error: { code: 'CEP_INVALID', message: 'CEP inválido.' } }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal, next: { revalidate: 3600 } });
    if (!response.ok) return NextResponse.json({ error: { code: 'CEP_PROVIDER_FAILED', message: 'Não foi possível consultar o CEP.' } }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    const data = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (data.erro) return NextResponse.json({ error: { code: 'CEP_NOT_FOUND', message: 'CEP não encontrado.' } }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ logradouro: data.logradouro || '', bairro: data.bairro || '', cidade: data.localidade || '', uf: data.uf || '' }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch (error) {
    console.error('CEP_PROVIDER_UNAVAILABLE', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: { code: 'CEP_PROVIDER_UNAVAILABLE', message: 'Consulta de CEP indisponível.' } }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  } finally { clearTimeout(timeout); }
}
