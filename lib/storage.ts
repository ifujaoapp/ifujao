import * as SecureStore from 'expo-secure-store';
import { Paths, File, Directory } from 'expo-file-system';
import { open } from '@op-engineering/op-sqlite';

const DB_KEY_STORAGE = 'ifujao_db_key';
const DB_NAME = 'ifujao.sqlite';
const PHOTOS_DIR = new Directory(Paths.document, 'pet_photos');

export interface PetRecord {
  id: string;
  species: string;
  breed?: string;
  name?: string;
  location: string;
  description: string;
  contact: string;
  ownerPhone: string;
  ownerDeviceId?: string;
  reporterDeviceId?: string;
  images: string[];
  latitude: number;
  longitude: number;
  city?: string;
  reward?: number;
  reported?: boolean;
  reportReason?: string;
  reportedBy?: string;
  lostDate?: string;
  foundAt?: string | null;
  // Tipo de post: 'lost' = dono perdeu o pet; 'found' = terceiro encontrou um
  // pet perdido (fluxo de quem achou). Padrão 'lost' para registros legados.
  postType?: 'lost' | 'found';
  // Data em que o pet foi ENCONTRADO (usado quando postType === 'found').
  foundDate?: string;
  // Matching manual (perdido <-> achado): matchedPetId aponta para o post
  // relacionado; matchStatus: 'pending' | 'confirmed'; matchRequestedBy indica
  // quem iniciou ('owner' = dono do perdido, 'finder' = dono do achado).
  matchedPetId?: string | null;
  matchStatus?: 'pending' | 'confirmed' | null;
  matchRequestedBy?: 'owner' | 'finder' | null;
  // Status calculado: true se o pet foi confirmado como devolvido ao dono
  // (existe um perdido com matchedPetId === este pet e matchStatus === 'confirmed')
  confirmed?: boolean;
  // Campos de sincronização (backend)
  dirty?: boolean;
  remoteImageUrls?: string[];
  updatedAt?: string;
  deletedAt?: string | null;
}

const ensureDbKey = async (): Promise<string> => {
  let key = await SecureStore.getItemAsync(DB_KEY_STORAGE);
  if (!key) {
    const bytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    key = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await SecureStore.setItemAsync(DB_KEY_STORAGE, key);
  }
  return key;
};

let dbPromise: Promise<ReturnType<typeof open>> | null = null;

const getDb = async () => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const key = await ensureDbKey();
      const database = open({ name: DB_NAME, encryptionKey: key });
      await database.execute(
        `CREATE TABLE IF NOT EXISTS pets (
          id TEXT PRIMARY KEY NOT NULL,
          data TEXT NOT NULL
        );`
      );
      return database;
    })();
  }
  return dbPromise;
};

const copyPhotoToDocs = async (uri: string): Promise<string> => {
  try {
    const dirInfo = await PHOTOS_DIR.info();
    if (!dirInfo.exists) await PHOTOS_DIR.create();
    const src = new File(uri);
    const ext = uri.includes('.') ? uri.split('.').pop()!.split('?')[0] : 'jpg';
    const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
    const dest = new File(PHOTOS_DIR, fileName);
    await src.copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
};

export const persistPhotos = async (images: string[]): Promise<string[]> =>
  Promise.all(images.map(copyPhotoToDocs));

export const loadPets = async (): Promise<PetRecord[]> => {
  try {
    const db = await getDb();
    const res = await db.execute('SELECT data FROM pets');
    return (res.rows as Array<{ data: string }>).map((r) => JSON.parse(r.data) as PetRecord);
  } catch {
    return [];
  }
};

export const getPetById = async (id: string): Promise<PetRecord | null> => {
  try {
    const db = await getDb();
    const res = await db.execute('SELECT data FROM pets WHERE id = ?', [id]);
    const rows = res.rows as Array<{ data: string }>;
    if (!rows || rows.length === 0) return null;
    return JSON.parse(rows[0].data) as PetRecord;
  } catch {
    return null;
  }
};

export const savePets = async (pets: PetRecord[]): Promise<void> => {
  const db = await getDb();
  await db.transaction(async (tx: any) => {
    await tx.execute('DELETE FROM pets;');
    for (const pet of pets) {
      await tx.execute('INSERT INTO pets (id, data) VALUES (?, ?);', [
        pet.id,
        JSON.stringify(pet),
      ]);
    }
  });
};

export const clearPhotos = async (uris: string[]): Promise<void> => {
  await Promise.all(
    uris.map(async (uri) => {
      try {
        if (uri.startsWith(PHOTOS_DIR.uri)) {
          const file = new File(uri);
          const info = await file.info();
          if (info.exists) await file.delete();
        }
      } catch {}
    })
  );
};
