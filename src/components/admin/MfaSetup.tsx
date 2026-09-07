'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function MfaSetup() {
  const router = useRouter();
  const supabase = createClient();
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [code, setCode] = useState('');
  const [hasVerifiedFactor, setHasVerifiedFactor] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) { console.error('MFA listFactors error:', listError); setError('Não foi possível carregar a autenticação multifator.'); setLoading(false); return; }
      const verified = data.totp.find((factor) => factor.status === 'verified');
      if (verified) {
        setFactorId(verified.id); setHasVerifiedFactor(true); setLoading(false); return;
      }
      const pending = (data.totp as Array<{ id: string; status: string }>).find(
        (factor) => factor.status === 'unverified',
      );
      if (pending) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: pending.id });
        if (unenrollError) {
          console.error('MFA unenroll error:', unenrollError);
          setError('Já existe um autenticador pendente. Remova-o no Supabase Auth e tente novamente.');
          setLoading(false);
          return;
        }
      }
      const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'OMC Admin TOTP',
      });
      if (enrollError) { console.error('MFA enroll error:', enrollError); setError('Não foi possível iniciar o cadastro do autenticador.'); }
      else { setFactorId(enrollment.id); setQrCode(enrollment.totp.qr_code); }
      setLoading(false);
    })();
  }, []);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) { setError('Código MFA inválido ou expirado.'); return; }
    const result = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() });
    if (result.error) { setError('Código MFA inválido ou expirado.'); return; }
    router.replace('/admin/dashboard'); router.refresh();
  };

  if (loading) return <p className="text-sm text-slate-500">Carregando autenticação multifator...</p>;
  return <div className="space-y-4">
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {hasVerifiedFactor ? <p className="text-sm text-slate-600">Digite o código de seis dígitos do seu aplicativo autenticador.</p> : <>
      <p className="text-sm text-slate-600">Escaneie este QR Code no Google Authenticator, Microsoft Authenticator ou aplicativo compatível.</p>
      {qrCode && <img src={qrCode.startsWith('data:') ? qrCode : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`} alt="QR Code para configurar MFA" className="h-48 w-48 border p-2" />}
    </>}
    <form onSubmit={verify} className="flex gap-2">
      <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className="rounded-lg border p-2" placeholder="000000" />
      <button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white">Verificar</button>
    </form>
  </div>;
}
