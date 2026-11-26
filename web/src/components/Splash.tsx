import { useEffect, useState } from 'react';

const KEY = 'emadeco.splash';
const seen = () => {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/** Page de bienvenue : s'affiche à l'ouverture de l'application, puis s'efface d'elle-même. */
export default function Splash() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>(() => (seen() ? 'gone' : 'show'));

  useEffect(() => {
    if (phase === 'gone') return;
    const t1 = setTimeout(() => setPhase('fade'), 2800);
    const t2 = setTimeout(() => {
      setPhase('gone');
      try {
        sessionStorage.setItem(KEY, '1');
      } catch {
        /* ignoré */
      }
    }, 3500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);

  if (phase === 'gone') return null;
  return (
    <div className={`splash ${phase === 'fade' ? 'splash-out' : ''}`} role="status" aria-label="Bienvenue sur EMADECO">
      <img className="splash-bg" src="/img/shop/p08.webp" alt="" />
      <div className="splash-shade" />
      <div className="splash-body">
        <span className="splash-mark" aria-hidden>
          E
        </span>
        <h1>EMADECO</h1>
        <p className="splash-sub">Décoration &amp; Événements</p>
        <span className="splash-line" aria-hidden />
        <p className="splash-tag">Vos événements, notre passion</p>
      </div>
    </div>
  );
}
