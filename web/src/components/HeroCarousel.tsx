import { useEffect, useState, type ReactNode } from 'react';

const SLIDES = [
  '/img/shop/p08.webp',
  '/img/shop/p13.webp',
  '/img/shop/p07.webp',
  '/img/shop/p02.webp',
  '/img/shop/p12.webp',
  '/img/shop/p06.webp',
  '/img/shop/p05.webp',
];
const EVERY_MS = 3000;

/** En-tête de l'accueil : photos qui défilent toutes les 3 secondes en fondu. */
export default function HeroCarousel({ children }: { children: ReactNode }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % SLIDES.length), EVERY_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="hero">
      {SLIDES.map((src, k) => (
        <img
          key={src}
          className={`hero-img hero-slide ${k === i ? 'hero-slide-on' : ''}`}
          src={src}
          alt=""
          aria-hidden
          fetchPriority={k === 0 ? 'high' : 'low'}
          loading={k === 0 ? 'eager' : 'lazy'}
        />
      ))}
      <div className="hero-shade" />
      <div className="hero-content">{children}</div>
      <div className="hero-dots" aria-hidden>
        {SLIDES.map((_, k) => (
          <span key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
    </section>
  );
}
