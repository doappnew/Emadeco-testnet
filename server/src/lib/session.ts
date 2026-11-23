import jwt from 'jsonwebtoken';

const ISSUER = 'emadeco';
const TTL_SECONDS = 60 * 60 * 24 * 7;

/** Le jeton de session ne contient que l'identifiant de profil : rôle et statut sont relus en base à chaque appel. */
export function signSession(profileId: string, secret: string): string {
  return jwt.sign({ sub: profileId }, secret, { algorithm: 'HS256', issuer: ISSUER, expiresIn: TTL_SECONDS });
}

export function verifySession(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER });
    if (typeof payload === 'object' && typeof payload.sub === 'string') return payload.sub;
    return null;
  } catch {
    return null;
  }
}
