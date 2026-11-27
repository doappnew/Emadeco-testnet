import { describe, expect, it } from 'vitest';
import { bannerVisible, payoutView, type PayoutStatus } from './testnetVisibility';

const base: PayoutStatus = { available: true, closed: false, offer: true, received: false };
const fresh = { seenBefore: false, justReceived: false };

describe('test de réception : affichage', () => {
  it('propose le bouton tant que le test est ouvert', () => {
    expect(payoutView(base, fresh)).toBe('offer');
    expect(bannerVisible(base, false)).toBe(true);
  });
  it('affiche « reçu » une seule fois après réception, puis plus rien', () => {
    const got = { ...base, offer: false, received: true };
    expect(payoutView(got, fresh)).toBe('received');
    expect(payoutView(got, { seenBefore: true, justReceived: false })).toBe('none'); // visites suivantes
    expect(payoutView(got, { seenBefore: true, justReceived: true })).toBe('received'); // même visite
    expect(bannerVisible(got, false)).toBe(false);
  });
  it('retire tout après clôture par l’administrateur', () => {
    const closed = { ...base, closed: true, offer: false };
    expect(payoutView(closed, fresh)).toBe('none');
    expect(payoutView({ ...closed, received: true }, fresh)).toBe('none');
    expect(bannerVisible(closed, false)).toBe(false);
  });
  it('retire tout quand les 5 pionniers sont servis (offre fermée)', () => {
    expect(payoutView({ ...base, offer: false }, fresh)).toBe('none');
    expect(bannerVisible({ ...base, offer: false }, false)).toBe(false);
  });
  it('retire tout quand TESTNET_PAYOUT est désactivé', () => {
    const off = { ...base, available: false, offer: false };
    expect(payoutView(off, fresh)).toBe('none');
    expect(payoutView(null, fresh)).toBe('none');
  });
  it('la bannière se masque', () => {
    expect(bannerVisible(base, true)).toBe(false);
  });
});
