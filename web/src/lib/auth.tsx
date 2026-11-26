import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, errorMessage, session, setUnauthorizedHandler } from './api';
import { piAuthenticate, PiUnavailableError } from './pi';
import type { AppConfig, Profile, ProviderRef, Role } from './types';

interface MeResponse {
  profile: Profile;
  provider: ProviderRef | null;
  unread_notifications: number;
}

interface AuthState {
  ready: boolean;
  config: AppConfig | null;
  user: Profile | null;
  provider: ProviderRef | null;
  unread: number;
  loginWithPi: () => Promise<void>;
  loginDemo: (role: Role) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUnread: (n: number) => void;
}

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth hors AuthProvider');
  return v;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [provider, setProvider] = useState<ProviderRef | null>(null);
  const [unread, setUnread] = useState(0);
  const mounted = useRef(true);

  const clear = useCallback(() => {
    session.clear();
    setUser(null);
    setProvider(null);
    setUnread(0);
  }, []);

  const refresh = useCallback(async () => {
    if (!session.get()) return;
    try {
      const me = await api.get<MeResponse>('/me');
      if (!mounted.current) return;
      setUser(me.profile);
      setProvider(me.provider);
      setUnread(me.unread_notifications);
    } catch {
      /* 401/403 : le gestionnaire global vide la session */
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setUnauthorizedHandler(clear);
    (async () => {
      try {
        setConfig(await api.get<AppConfig>('/config'));
      } catch {
        setConfig({ demo_mode: false, pi_network: 'testnet', pi_sandbox: false });
      }
      await refresh();
      if (mounted.current) setReady(true);
    })();
    return () => {
      mounted.current = false;
    };
  }, [clear, refresh]);

  // Compteur de notifications : rafraîchi toutes les 60 s tant que l'utilisateur est connecté.
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [user, refresh]);

  const finishLogin = useCallback(
    async (token: string) => {
      session.set(token);
      await refresh();
    },
    [refresh],
  );

  const loginWithPi = useCallback(async () => {
    let accessToken: string;
    const incomplete: string[] = [];
    try {
      accessToken = await piAuthenticate({ sandbox: config?.pi_sandbox ?? false, onIncomplete: (id) => incomplete.push(id) });
    } catch (e) {
      if (e instanceof PiUnavailableError) {
        throw new Error('Le SDK Pi est introuvable. Ouvrez EMADECO depuis Pi Browser pour vous connecter.');
      }
      throw new Error('Connexion Pi annulée ou impossible. Réessayez.');
    }
    try {
      const res = await api.post<{ token: string }>('/auth/pi', { accessToken });
      await finishLogin(res.token);
      // Paiement resté en suspens : le serveur le reprend ou l'ignore (sans bloquer la connexion).
      for (const paymentId of incomplete) void api.post('/shop/payments/incomplete', { paymentId }).catch(() => undefined);
    } catch (e) {
      throw new Error(errorMessage(e));
    }
  }, [config, finishLogin]);

  const loginDemo = useCallback(
    async (role: Role) => {
      const res = await api.post<{ token: string }>('/auth/demo', { role });
      await finishLogin(res.token);
    },
    [finishLogin],
  );

  const value = useMemo<AuthState>(
    () => ({ ready, config, user, provider, unread, loginWithPi, loginDemo, logout: clear, refresh, setUnread }),
    [ready, config, user, provider, unread, loginWithPi, loginDemo, clear, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
