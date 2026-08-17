import { File } from 'expo-file-system';
import { getSupabase } from './supabase';

const BUCKET = 'pet-photos';

const safeExtOf = (uri: string): string => {
  const ext = uri.includes('.') ? uri.split('.').pop()!.split('?')[0] : 'jpg';
  return /^[a-z0-9]+$/i.test(ext) ? ext : 'jpg';
};

// Faz upload das imagens locais (file://) que ainda não foram enviadas e retorna
// a lista de URLs públicas (preservando as já existentes em `existingUrls`).
// Imagens que já são URL remotas são mantidas. Falhas são ignoradas individualmente.
export const uploadPetPhotos = async (
  localImages: string[],
  deviceId: string,
  existingUrls: string[] = []
): Promise<string[]> => {
  const sb = getSupabase();
  if (!sb) return existingUrls;
  const urls: string[] = [...existingUrls];
  for (const uri of localImages) {
    if (!uri.startsWith('file://')) {
      if (uri.startsWith('http') && !urls.includes(uri)) urls.push(uri);
      continue;
    }
    try {
      const ext = safeExtOf(uri);
      const fileName = `${deviceId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const arrayBuffer = await new File(uri).arrayBuffer();
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(fileName, arrayBuffer, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: false,
          cacheControl: '3600',
        });
      if (error) {
        console.warn('[photos] upload falhou:', error.message);
        continue;
      }
      const { data } = sb.storage.from(BUCKET).getPublicUrl(fileName);
      if (data?.publicUrl && !urls.includes(data.publicUrl)) urls.push(data.publicUrl);
    } catch (e) {
      console.warn('[photos] erro de upload:', e);
    }
  }
  return urls;
};
