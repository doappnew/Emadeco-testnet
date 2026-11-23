import { describe, expect, it } from 'vitest';
import { ACTION_LABELS, EVENT_TYPES, formatDate, initials, splitList, STATUS_LABELS, TAB_STATUSES, timeAgo } from './format';

describe('format', () => {
  it('découpe les listes saisies (virgules, doublons, limite)', () => {
    expect(splitList(' Mariages, Ballons ;Mariages\n Gala ', 12)).toEqual(['Mariages', 'Ballons', 'Gala']);
    expect(splitList('a,b,c,d', 2)).toEqual(['a', 'b']);
    expect(splitList('', 5)).toEqual([]);
  });
  it('formate les dates en français', () => {
    expect(formatDate('2027-01-07')).toBe('7 janvier 2027');
    expect(formatDate('')).toBe('');
    expect(formatDate('pas une date')).toBe('');
  });
  it('exprime l’ancienneté', () => {
    const now = Date.parse('2026-11-23T12:00:00Z');
    expect(timeAgo('2026-11-23T11:59:30Z', now)).toBe('à l’instant');
    expect(timeAgo('2026-11-23T11:30:00Z', now)).toBe('il y a 30 min');
    expect(timeAgo('2026-11-23T09:00:00Z', now)).toBe('il y a 3 h');
    expect(timeAgo('2026-11-21T12:00:00Z', now)).toBe('il y a 2 j');
  });
  it('calcule les initiales', () => {
    expect(initials('Élégance Déco')).toBe('ÉD');
    expect(initials('')).toBe('E');
  });
  it('couvre les 7 statuts dans les 3 onglets de suivi, sans doublon', () => {
    const all = Object.values(TAB_STATUSES).flat();
    expect([...all].sort()).toEqual(Object.keys(STATUS_LABELS).sort());
    expect(new Set(all).size).toBe(all.length);
  });
  it('les types d’événements ne contiennent aucun vocabulaire financier', () => {
    expect(EVENT_TYPES.join(' ')).not.toMatch(/budget|prix|tarif|devis|montant/i);
    expect(Object.values(ACTION_LABELS.provider).join(' ')).not.toMatch(/budget|prix|tarif|devis|montant|paiement/i);
  });
});
