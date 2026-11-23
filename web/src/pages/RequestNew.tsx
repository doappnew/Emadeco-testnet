import { useState, type ChangeEvent } from 'react';
import { ArrowLeft, CheckCircle2, ImagePlus, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorState, Field, Spinner, useToast } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { EVENT_TYPES, formatDate, todayISO } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { ProviderCardData, ServiceItem } from '../lib/types';

interface ProviderDetail {
  provider: ProviderCardData;
  services: ServiceItem[];
  is_own: boolean;
}
interface Photo {
  path: string;
  preview: string | null;
}

const MAX_PHOTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const OTHER = 'Autre';

/**
 * Demande de prestation en 3 étapes : événement → ambiance → récapitulatif.
 * Aucun champ financier n'existe dans ce formulaire.
 */
export default function RequestNew() {
  const [params] = useSearchParams();
  const providerId = params.get('provider');
  const nav = useNavigate();
  const { toast } = useToast();
  const { data, loading, error, reload } = useAsync(
    () => (providerId ? api.get<ProviderDetail>(`/providers/${providerId}`) : Promise.reject(new Error('missing'))),
    [providerId],
  );

  const [step, setStep] = useState(1);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [f, setF] = useState({
    event_type: '',
    event_type_other: '',
    event_date: '',
    event_location: '',
    guests_approx: '',
    service_id: '',
    theme: '',
    colors: '',
    requested_services: '',
    details: '',
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  if (!providerId) return <ErrorState message="Choisissez d’abord un prestataire." />;
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Prestataire introuvable.'} onRetry={reload} />;
  if (data.is_own) return <ErrorState message="Vous ne pouvez pas vous adresser une demande à vous-même." />;

  const eventType = f.event_type === OTHER ? f.event_type_other.trim() : f.event_type;

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!eventType || eventType.length < 2) e.event_type = 'Indiquez le type d’événement.';
      if (!f.event_date) e.event_date = 'Choisissez la date.';
      else if (f.event_date < todayISO()) e.event_date = 'La date doit être aujourd’hui ou dans le futur.';
      if (f.event_location.trim().length < 2) e.event_location = 'Indiquez le lieu (ville, salle…).';
      if (f.guests_approx && (!/^\d+$/.test(f.guests_approx) || Number(f.guests_approx) < 1 || Number(f.guests_approx) > 100000)) {
        e.guests_approx = 'Nombre invalide.';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => validate(step) && setStep((s) => s + 1);

  const addPhotos = async (ev: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(ev.target.files ?? []);
    ev.target.value = '';
    for (const file of files) {
      if (photos.length >= MAX_PHOTOS) return toast(`${MAX_PHOTOS} photos maximum.`, 'error');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast(`« ${file.name} » : format non accepté (JPEG, PNG ou WebP).`, 'error');
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast(`« ${file.name} » dépasse 5 Mo.`, 'error');
        continue;
      }
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await api.upload<{ path: string; preview_url: string | null }>('/uploads/inspiration', fd);
        setPhotos((p) => [...p, { path: r.path, preview: r.preview_url }]);
      } catch (e) {
        toast(errorMessage(e), 'error');
      } finally {
        setUploading(false);
      }
    }
  };

  const submit = async () => {
    if (!validate(1)) return setStep(1);
    setBusy(true);
    try {
      const svc = data.services.find((s) => s.id === f.service_id);
      const body: Record<string, unknown> = {
        provider_id: providerId,
        event_type: eventType,
        event_date: f.event_date,
        event_location: f.event_location.trim(),
        inspiration_paths: photos.map((p) => p.path),
      };
      if (svc) {
        body.service_id = svc.id;
        body.category_id = svc.category_id;
      }
      if (f.guests_approx) body.guests_approx = Number(f.guests_approx);
      for (const k of ['theme', 'colors', 'requested_services', 'details'] as const) if (f[k].trim()) body[k] = f[k].trim();
      const r = await api.post<{ id: string }>('/requests', body);
      setDone(r.id);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="state success">
        <CheckCircle2 size={48} aria-hidden />
        <h1 className="page-title">Demande envoyée</h1>
        <p>
          {data.provider.business_name} a été prévenu. Vous serez notifié dès qu’il répondra ou demandera des précisions.
        </p>
        <button className="btn btn-primary btn-block" onClick={() => nav(`/demandes/${done}`)}>
          Suivre ma demande
        </button>
        <Link to="/explorer" className="btn btn-outline btn-block">
          Continuer à explorer
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="form-head">
        <button className="icon-btn dark" onClick={() => (step > 1 ? setStep(step - 1) : nav(-1))} aria-label="Retour">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="page-title tight">Demande de prestation</h1>
          <p className="muted small">À {data.provider.business_name}</p>
        </div>
      </div>

      <ol className="steps" aria-label="Étapes">
        {['Événement', 'Ambiance', 'Envoi'].map((label, i) => (
          <li key={label} className={step === i + 1 ? 'on' : step > i + 1 ? 'past' : ''} aria-current={step === i + 1 ? 'step' : undefined}>
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="form">
          <Field label="Type d’événement *" error={errors.event_type}>
            <select value={f.event_type} onChange={set('event_type')}>
              <option value="">Sélectionnez…</option>
              {EVENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
              <option>{OTHER}</option>
            </select>
          </Field>
          {f.event_type === OTHER && (
            <Field label="Précisez le type d’événement *">
              <input value={f.event_type_other} onChange={set('event_type_other')} maxLength={60} />
            </Field>
          )}
          <Field label="Date de l’événement *" error={errors.event_date}>
            <input type="date" min={todayISO()} value={f.event_date} onChange={set('event_date')} />
          </Field>
          <Field label="Lieu de l’événement *" error={errors.event_location} hint="Ville, quartier, nom de la salle…">
            <input value={f.event_location} onChange={set('event_location')} maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Nombre approximatif d’invités" error={errors.guests_approx}>
            <input inputMode="numeric" value={f.guests_approx} onChange={set('guests_approx')} maxLength={6} placeholder="Ex. 120" />
          </Field>
          {data.services.length > 0 && (
            <Field label="Service concerné (facultatif)">
              <select value={f.service_id} onChange={set('service_id')}>
                <option value="">Je ne sais pas encore</option>
                {data.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="form">
          <Field label="Thème souhaité">
            <input value={f.theme} onChange={set('theme')} maxLength={120} placeholder="Ex. Jardin enchanté, bohème, tropical…" />
          </Field>
          <Field label="Couleurs">
            <input value={f.colors} onChange={set('colors')} maxLength={120} placeholder="Ex. Ivoire, vert, or" />
          </Field>
          <Field label="Services souhaités">
            <textarea rows={3} value={f.requested_services} onChange={set('requested_services')} maxLength={600} placeholder="Arche, table d’honneur, centres de table, location de chaises…" />
          </Field>
          <Field label="Précisions" hint="Style, contraintes du lieu, horaires, attentes particulières.">
            <textarea rows={4} value={f.details} onChange={set('details')} maxLength={2000} />
          </Field>

          <div className="field">
            <span className="field-label">
              Photos d’inspiration ({photos.length}/{MAX_PHOTOS})
            </span>
            <ul className="thumbs">
              {photos.map((p) => (
                <li key={p.path}>
                  {p.preview && <img src={p.preview} alt="Photo d’inspiration" />}
                  <button className="thumb-x" onClick={() => setPhotos((l) => l.filter((x) => x.path !== p.path))} aria-label="Retirer la photo">
                    <X size={14} />
                  </button>
                </li>
              ))}
              {photos.length < MAX_PHOTOS && (
                <li>
                  <label className={`thumb-add ${uploading ? 'busy' : ''}`}>
                    <ImagePlus size={22} aria-hidden />
                    <span>{uploading ? 'Envoi…' : 'Ajouter'}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addPhotos} disabled={uploading} />
                  </label>
                </li>
              )}
            </ul>
            <span className="field-hint">JPEG, PNG ou WebP · 5 Mo maximum par photo.</span>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="recap">
          <h2>Récapitulatif</h2>
          <dl>
            <dt>Prestataire</dt>
            <dd>{data.provider.business_name}</dd>
            <dt>Événement</dt>
            <dd>{eventType}</dd>
            <dt>Date</dt>
            <dd>{formatDate(f.event_date)}</dd>
            <dt>Lieu</dt>
            <dd>{f.event_location}</dd>
            {f.guests_approx && (
              <>
                <dt>Invités (approx.)</dt>
                <dd>{f.guests_approx}</dd>
              </>
            )}
            {f.theme && (
              <>
                <dt>Thème</dt>
                <dd>{f.theme}</dd>
              </>
            )}
            {f.colors && (
              <>
                <dt>Couleurs</dt>
                <dd>{f.colors}</dd>
              </>
            )}
            {f.requested_services && (
              <>
                <dt>Services souhaités</dt>
                <dd>{f.requested_services}</dd>
              </>
            )}
            {f.details && (
              <>
                <dt>Précisions</dt>
                <dd>{f.details}</dd>
              </>
            )}
            {photos.length > 0 && (
              <>
                <dt>Photos</dt>
                <dd>{photos.length} jointe(s)</dd>
              </>
            )}
          </dl>
          <p className="notice">Le prestataire étudiera votre demande et vous répondra via l’application.</p>
        </section>
      )}

      <div className="form-actions">
        {step < 3 ? (
          <button className="btn btn-primary btn-block" onClick={next}>
            Suivant
          </button>
        ) : (
          <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
            {busy ? 'Envoi en cours…' : 'Envoyer ma demande'}
          </button>
        )}
      </div>
    </>
  );
}
