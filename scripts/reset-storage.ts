import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  console.error("Faltam EXPO_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env/.env.local");
  process.exit(1);
}

const sb = createClient(url, serviceRole, { auth: { persistSession: false } });

const buckets = ["pet-photos", "match-proofs"];

async function emptyBucket(bucket: string) {
  let cursor: string | null = null;
  let removed = 0;
  do {
    const list = await sb.storage.from(bucket).list(undefined, {
      limit: 1000,
      offset: cursor ? parseInt(cursor, 10) : undefined,
    });

    if (list.error || !list.data?.length) break;

    const objects = list.data.map((item) => `${item.name}`);

    // remove folders by removing their contents recursively
    const toRemove: string[] = [];
    for (const obj of objects) {
      if (obj.endsWith("/")) {
        // folder marker
        continue;
      }
      toRemove.push(obj);
    }

    if (toRemove.length === 0) break;

    const { error } = await sb.storage.from(bucket).remove(toRemove);
    if (error) {
      console.error(`Erro removendo ${bucket}/${toRemove.length} itens:`, error.message);
      break;
    }

    removed += toRemove.length;
    cursor = String(list.data.length + (cursor ? parseInt(cursor, 10) : 0));
  } while (cursor);

  console.log(`Bucket ${bucket}: ${removed} objetos removidos`);
}

(async () => {
  for (const b of buckets) {
    await emptyBucket(b);
  }
  console.log("Concluído.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
