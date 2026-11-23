import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { badRequest } from './errors.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Valide et optimise une image envoyée :
 *  - type réel détecté par le contenu (et non par l'extension ou l'en-tête du client) ;
 *  - décodage complet par sharp (refuse les fichiers corrompus ou piégés) ;
 *  - rotation EXIF appliquée puis métadonnées supprimées (GPS, appareil…) ;
 *  - redimensionnement 1600 px max, conversion WebP.
 */
export async function processImage(input: Buffer): Promise<{ data: Buffer; contentType: 'image/webp'; ext: 'webp' }> {
  if (!input?.length) throw badRequest('Fichier vide.');
  if (input.length > MAX_UPLOAD_BYTES) throw badRequest('Image trop lourde (5 Mo maximum).');
  const type = await fileTypeFromBuffer(input);
  if (!type || !ALLOWED.has(type.mime)) {
    throw badRequest('Format non accepté. Utilisez une image JPEG, PNG ou WebP.');
  }
  try {
    const data = await sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return { data, contentType: 'image/webp', ext: 'webp' };
  } catch {
    throw badRequest('Image illisible ou corrompue.');
  }
}
