import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { STATUS_LABELS, STATUS_TONE } from '../lib/format';
import type { RequestStatus } from '../lib/types';

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <Loader2 className="spin" size={28} aria-hidden />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <AlertTriangle size={28} aria-hidden />
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-outline" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="state">
      <Inbox size={30} aria-hidden />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`badge badge-${STATUS_TONE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function Img({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={`img-fallback ${className ?? ''}`} role="img" aria-label={alt} />;
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`chip ${active ? 'chip-active' : ''}`} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Notifications éphémères
interface ToastApi {
  toast: (message: string, tone?: 'ok' | 'error') => void;
}
const ToastCtx = createContext<ToastApi>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; tone: 'ok' | 'error' }[]>([]);
  const toast = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
