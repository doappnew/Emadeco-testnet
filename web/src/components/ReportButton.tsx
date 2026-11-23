import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field, useToast } from './ui';

const REASONS = ['Contenu inapproprié', 'Photos trompeuses', 'Comportement non professionnel', 'Usurpation d’identité', 'Autre'];

export default function ReportButton({ targetType, targetId }: { targetType: 'provider' | 'portfolio_item' | 'user' | 'request'; targetId: string }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]!);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await api.post('/reports', { target_type: targetType, target_id: targetId, reason, details: details || undefined });
      toast('Merci, votre signalement a été transmis.');
      setOpen(false);
      setDetails('');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="link-btn" onClick={() => (user ? setOpen(true) : nav('/connexion?next=' + encodeURIComponent(location.pathname)))}>
        <Flag size={14} aria-hidden /> Signaler
      </button>
    );
  }
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Signaler">
      <div className="sheet-body">
        <h3>Signaler un contenu</h3>
        <Field label="Motif">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Précisions (facultatif)">
          <textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        <div className="row-actions">
          <button className="btn btn-outline" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={send} disabled={busy}>
            {busy ? 'Envoi…' : 'Envoyer le signalement'}
          </button>
        </div>
      </div>
    </div>
  );
}

