export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, code = 'bad_request') => new HttpError(400, m, code);
export const unauthorized = (m = 'Authentification requise.') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'Accès refusé.') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Ressource introuvable.') => new HttpError(404, m, 'not_found');
export const conflict = (m: string, code = 'conflict') => new HttpError(409, m, code);
