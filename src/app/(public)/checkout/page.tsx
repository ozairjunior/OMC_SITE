'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/useCartStore';
import { formatPostalCode, normalizePhone, normalizePostalCode } from '@/lib/validations/order';
import Link from 'next/link';

type OrderResponse = {
  orderId: string;
  publicCode: string;
  trackingToken: string;
  total: number;
  items: Array<{
    name: string;
    variantName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }>;
};

export default function CheckoutPage() {
  const { items, clearCart } = useCartStore();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<{ orderId: string; trackingToken: string; sessionId: string } | null>(null);
  const [formData, setFormData] = useState({
    customerName: '', customerPhone: '', address: '', addressNumber: '',
    neighborhood: '', city: 'João Pessoa', complement: '', referencePoint: '',
    postalCode: '', notes: '',
  });

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (!createdOrder || !whatsappUrl) return;
    void fetch(`/api/orders/${createdOrder.orderId}/whatsapp-shown`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingToken: createdOrder.trackingToken, sessionId: createdOrder.sessionId }),
      keepalive: true,
    });
  }, [createdOrder, whatsappUrl]);
  if (!hydrated) return <div className="p-8 text-center text-slate-500">Carregando formulário...</div>;
  if (items.length === 0 && !whatsappUrl) {
    return (
      <div className="max-w-md mx-auto p-8 text-center space-y-4">
        <h1 className="text-xl font-bold text-slate-800">Carrinho vazio</h1>
        <button onClick={() => router.push('/produtos')} className="bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-lg">Voltar ao catálogo</button>
      </div>
    );
  }

  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const update = (field: keyof typeof formData, value: string) => setFormData((current) => ({ ...current, [field]: field === 'customerPhone' ? normalizePhone(value) : field === 'postalCode' ? formatPostalCode(value) : value }));

  const lookupPostalCode = async () => {
    const postalCode = normalizePostalCode(formData.postalCode);
    if (!/^\d{8}$/.test(postalCode)) return;
    try {
      const response = await fetch(`/api/cep?cep=${postalCode.replace('-', '')}`);
      const data = await response.json();
      if (!response.ok) return;
      setFormData((current) => ({ ...current, postalCode: formatPostalCode(postalCode), address: data.logradouro || current.address, neighborhood: data.bairro || current.neighborhood, city: data.cidade || current.city }));
    } catch { /* preenchimento automatico opcional; campos continuam editaveis */ }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const storageKey = 'omc_order_idempotency_key';
      const idempotencyKey = sessionStorage.getItem(storageKey) || crypto.randomUUID();
      sessionStorage.setItem(storageKey, idempotencyKey);
      const response = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          idempotencyKey,
          items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        }),
      });
      const result = await response.json() as OrderResponse & { error?: string | { message?: string } };
      if (!response.ok) {
        const errorMessage = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMessage || 'Erro ao registrar pedido');
      }

      const sessionId = sessionStorage.getItem('omc_checkout_session') || crypto.randomUUID();
      sessionStorage.setItem('omc_checkout_session', sessionId);
      let text = '*SOLICITAÇÃO DE ORÇAMENTO - OLIVEIRA MATERIAL DE CONSTRUÇÃO*\n';
      text += `*Código:* ${result.publicCode}\n*Cliente:* ${formData.customerName}\n*Telefone:* ${formData.customerPhone}\n`;
      text += `*Endereço:* ${formData.address}, Nº ${formData.addressNumber} - ${formData.neighborhood}, ${formData.city}\n`;
      if (formData.complement) text += `*Complemento:* ${formData.complement}\n`;
      if (formData.notes) text += `*Observações:* ${formData.notes}\n`;
      text += '\n*ITENS:*\n';
      result.items.forEach((item) => {
        text += `• ${item.name} (${item.variantName}) — ${item.quantity} ${item.unit} x ${currency(item.unitPrice)} = ${currency(item.totalPrice)}\n`;
      });
      text += `\n*TOTAL ESTIMADO:* ${currency(result.total)}\n_Sujeito à confirmação de disponibilidade e frete._`;
      const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5583987838406';
      setWhatsappUrl(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
      setCreatedOrder({ orderId: result.orderId, trackingToken: result.trackingToken, sessionId });
      sessionStorage.removeItem(storageKey);
      clearCart();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Falha ao processar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const registerWhatsappClick = () => {
    if (!createdOrder) return;
    void fetch(`/api/orders/${createdOrder.orderId}/whatsapp-click`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingToken: createdOrder.trackingToken, sessionId: createdOrder.sessionId }),
      keepalive: true,
    });
  };

  const inputClass = 'w-full border p-2 text-sm rounded-lg outline-none focus:ring-2 focus:ring-amber-500';
  return (
    <div className="max-w-2xl mx-auto p-6 bg-white border border-slate-200 rounded-2xl shadow-sm my-8 space-y-6">
      <div><h1 className="text-xl font-bold text-slate-900">Finalizar orçamento</h1><p className="text-xs text-slate-500">Informe os dados de entrega para envio via WhatsApp</p></div>
      {whatsappUrl ? (
        <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-4">
          <h2 className="font-bold text-emerald-900">Solicitação registrada com sucesso!</h2>
          <p className="text-sm text-emerald-800">Abra o WhatsApp para enviar os detalhes à loja.</p>
          <a href={whatsappUrl} onClick={registerWhatsappClick} target="_blank" rel="noopener noreferrer" className="inline-flex bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 rounded-xl">Abrir WhatsApp</a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nome completo"><input name="customerName" maxLength={150} required value={formData.customerName} onChange={(e) => update('customerName', e.target.value)} className={inputClass} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Telefone / WhatsApp"><input name="customerPhone" maxLength={30} required value={formData.customerPhone} onChange={(e) => update('customerPhone', e.target.value)} className={inputClass} /></Field>
            <Field label="CEP (opcional)"><input name="postalCode" maxLength={9} inputMode="numeric" value={formData.postalCode} onChange={(e) => update('postalCode', e.target.value)} onBlur={() => void lookupPostalCode()} className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="col-span-2"><Field label="Logradouro / Endereço"><input name="address" maxLength={200} required value={formData.address} onChange={(e) => update('address', e.target.value)} className={inputClass} /></Field></div>
            <Field label="Número"><input name="addressNumber" maxLength={20} required value={formData.addressNumber} onChange={(e) => update('addressNumber', e.target.value)} className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bairro"><input name="neighborhood" maxLength={100} required value={formData.neighborhood} onChange={(e) => update('neighborhood', e.target.value)} className={inputClass} /></Field>
            <Field label="Cidade"><input name="city" maxLength={100} required value={formData.city} onChange={(e) => update('city', e.target.value)} className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Complemento"><input name="complement" maxLength={100} value={formData.complement} onChange={(e) => update('complement', e.target.value)} className={inputClass} /></Field>
            <Field label="Ponto de referência"><input name="referencePoint" maxLength={200} value={formData.referencePoint} onChange={(e) => update('referencePoint', e.target.value)} className={inputClass} /></Field>
          </div>
          <Field label="Observações"><textarea name="notes" maxLength={1000} rows={2} value={formData.notes} onChange={(e) => update('notes', e.target.value)} className={inputClass} /></Field>
          <p className="text-xs leading-relaxed text-slate-500">Usaremos seus dados exclusivamente para processar o orçamento, entrar em contato e organizar a entrega. <Link href="/privacidade" className="text-amber-700 underline">Leia nossa política de privacidade.</Link></p>
          <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl disabled:opacity-50">{loading ? 'Validando e gravando...' : 'Enviar solicitação para o WhatsApp'}</button>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold space-y-1"><span>{label}</span>{children}</label>;
}
