import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { ensureSession, getSupabase } from './supabase';

const BUCKET = 'pet-photos';

const safeExtOf = (uri: string): string => {
  const ext = uri.includes('.') ? uri.split('.').pop()!.split('?')[0] : 'jpg';
  return /^[a-z0-9]+$/i.test(ext) ? ext : 'jpg';
};

// Comprime a imagem local antes do upload: max 512px no lado maior,
// qualidade 0.7 JPEG. Resulta em arquivo ~30-80KB, suficiente para
// visualização no app e rápido de enviar para o Gemini.
const compressImage = async (uri: string): Promise<{ uri: string; base64?: string }> => {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512 } }],
    {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );
  return result;
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
      const compressed = await compressImage(uri);
      const compressedUri = compressed.uri;
      const ext = 'jpg';
      const fileName = `${deviceId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const arrayBuffer = await new File(compressedUri).arrayBuffer();
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
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

// Extrai o caminho do objeto (após "/pet-photos/") a partir de uma URL pública.
const storagePathFromUrl = (url: string): string | null => {
  const marker = '/pet-photos/';
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return url.slice(idx + marker.length);
};

// Remove as fotos remotas de um pet do Storage (economiza espaço ao apagar).
// Só remove arquivos cuja pasta raiz == deviceId (garante que o dono só apaga
// as próprias fotos — a policy de RLS no Storage reforça isso).
export const deletePetPhotos = async (urls: string[], deviceId: string): Promise<void> => {
  // Garante sessão autenticada com o device_id gravado — a RLS de delete
  // (pet-photos owner delete) só libera se current_device_id() == pasta do objeto.
  const sb = await ensureSession(deviceId);
  if (!sb || !deviceId || urls.length === 0) return;
  const paths = urls
    .map(storagePathFromUrl)
    .filter((p): p is string => !!p && p.startsWith(`${deviceId}/`));
  if (paths.length === 0) return;
  try {
    const { error } = await sb.storage.from(BUCKET).remove(paths);
    if (error) console.warn('[photos] delete de fotos falhou:', error.message);
  } catch (e) {
    console.warn('[photos] erro ao deletar fotos:', e);
  }
};
