'use client';

import { useState } from 'react';

const STATUS_LABELS = {
  cart_created: { label: 'Carrinho criado', color: 'bg-slate-100 text-slate-800' },
  checkout_started: { label: 'Checkout iniciado', color: 'bg-blue-100 text-blue-800' },
  request_created: { label: 'Solicitação criada', color: 'bg-cyan-100 text-cyan-800' },
  whatsapp_clicked: { label: 'WhatsApp clicado', color: 'bg-emerald-100 text-emerald-800' },
  contacted: { label: 'Em atendimento', color: 'bg-purple-100 text-purple-800' },
  quoted: { label: 'Orçamento enviado', color: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmado', color: 'bg-teal-100 text-teal-800' },
  completed: { label: 'Concluído', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
} as const;

type OrderStatus = keyof typeof STATUS_LABELS;
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  cart_created: ['checkout_started', 'cancelled'],
  checkout_started: ['request_created', 'whatsapp_clicked', 'cancelled'],
  request_created: ['whatsapp_clicked', 'contacted', 'quoted', 'confirmed', 'cancelled'],
  whatsapp_clicked: ['contacted', 'quoted', 'confirmed', 'cancelled'],
  contacted: ['quoted', 'confirmed', 'cancelled'],
  quoted: ['contacted', 'confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function OrderStatusSelect({ orderId, currentStatus }: { orderId: string; currentStatus: string }) {
  const initialStatus = currentStatus in STATUS_LABELS ? currentStatus as OrderStatus : 'request_created';
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const options = [status, ...TRANSITIONS[status]];

  const changeStatus = async (newStatus: OrderStatus) => {
    if (newStatus === status) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao atualizar status.');
      setStatus(newStatus);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao atualizar status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <select
      value={status}
      disabled={loading || TRANSITIONS[status].length === 0}
      onChange={(event) => changeStatus(event.target.value as OrderStatus)}
      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border-0 cursor-pointer disabled:cursor-not-allowed ${STATUS_LABELS[status].color}`}
    >
      {options.map((option) => <option key={option} value={option}>{STATUS_LABELS[option].label}</option>)}
    </select>
  );
}
