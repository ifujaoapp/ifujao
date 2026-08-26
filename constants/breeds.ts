import { type PetRecord } from "@/lib/storage";

export type PetPost = PetRecord;

// Janela em que o pino "REENCONTRADO" (verde) fica visível no mapa após o dono
// marcar o pet como encontrado. Passada a janela, o pino some automaticamente
// do mapa (mas o registro permanece no app, com selo "Encontrado").
export const FOUND_WINDOW_HOURS = 48;
export const FOUND_WINDOW_MS = FOUND_WINDOW_HOURS * 3600 * 1000;

// Verdadeiro enquanto o pino verde de reencontro ainda deve aparecer no mapa.
export const isFoundActive = (foundAt?: string | null): boolean => {
  if (!foundAt) return false;
  const t = new Date(foundAt).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t <= FOUND_WINDOW_MS;
};

export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Espécie -> raças válidas. A raça fica "amarrada" à espécie (não dá para
// escolher uma raça de gato para um cão). A espécie é editável (texto livre)
// e sugerida a partir destas opções; a raça também aceita texto livre.
export const SPECIES_BREEDS: Record<string, string[]> = {
  Cachorro: [
    "Shih Tzu",
    "Golden Retriever",
    "Labrador Retriever",
    "Poodle",
    "Buldogue Francês",
    "Spitz Alemão (Lulu da Pomerânia)",
    "Pastor Alemão",
    "Pinscher",
    "Yorkshire Terrier",
    "Beagle",
    "Rottweiler",
    "Doberman",
    "Boxer",
    "Dachshund",
    "Border Collie",
    "Pastor Australiano",
    "Akita",
    "Shiba Inu",
    "Husky Siberiano",
    "Maltês",
    "Pug",
    "Chihuahua",
    "Cavalier King Charles Spaniel",
    "Cane Corso",
    "Pit Bull",
    "American Bully",
    "Bull Terrier",
    "Chow Chow",
    "Basset Hound",
    "Shar Pei",
    "Cocker Spaniel",
    "Lhasa Apso",
    "Bernese Mountain Dog",
    "São Bernardo",
    "Dogue Alemão",
    "Boston Terrier",
    "Whippet",
    "Sem Raça Definida",
  ],
  Gato: [
    "Persa",
    "Maine Coon",
    "Siamês",
    "Ragdoll",
    "Sphynx",
    "Bengal",
    "British Shorthair",
    "Angorá",
    "Abissínio",
    "Birmanês",
    "Chartreux",
    "Cornish Rex",
    "Devon Rex",
    "Exótico",
    "Norwegian Forest",
    "Oriental",
    "Russian Blue",
    "Scottish Fold",
    "Selkirk Rex",
    "Somali",
    "Tonquinês",
    "Turkish Van",
    "American Shorthair",
    "Sem Raça Definida",
  ],
  Calopsita: [
    "Ancestral",
    "Lutino",
    "Cara Branca",
    "Pérola",
    "Arlequim",
    "Canela",
    "Albina",
    "Bochecha Amarela",
    "Prata",
    "Pastel",
    "Fulvo",
  ],
  Papagaio: [
    "Papagaio-verdadeiro",
    "Papagaio-chauá",
    "Papagaio-cinzento",
    "Papagaio-eclectus",
    "Papagaio-do-mangue",
    "Papagaio-diadema",
    "Papagaio-moleiro",
    "Papagaio-de-charão",
    "Papagaio-galego",
    "Papagaio-de-cabeça-amarela",
  ],
  Arara: [
    "Arara-canindé",
    "Arara-vermelha",
    "Arara-azul-grande",
    "Arara-militar",
    "Arara-verde",
    "Ararinha-maracanã",
    "Arara-juba",
  ],
  Cacatua: [
    "Cacatua-de-crista-amarela",
    "Cacatua-galah",
    "Cacatua-branca",
    "Cacatua-das-molucas",
    "Cacatua-de-crista-rosa",
    "Cacatua-negra",
  ],
  "Periquito-australiano": [
    "Periquito Comum",
    "Periquito Inglês",
    "Arlequim",
    "Lutino",
    "Albino",
    "Asa Cinza",
    "Opalino",
    "Asas Claras",
  ],
  Agapornis: [
    "Agapornis Roseicollis",
    "Agapornis Personatus",
    "Agapornis Fischeri",
    "Agapornis Lilianae",
    "Agapornis Nigrigenis",
    "Agapornis Cana",
    "Agapornis Taranta",
  ],
  Ferret: [
    "Sável",
    "Albino",
    "Canela",
    "Prateado",
    "Panda",
    "Chocolate",
    "Champagne",
    "Blaze",
  ],
  Hámster: [
    "Hámster Sírio",
    "Hámster Anão Russo Winter White",
    "Hámster Anão Russo Campbell",
    "Hámster Roborovski",
    "Hámster Chinês",
  ],
  Coelho: [
    "Mini Lion Head",
    "Netherland Dwarf",
    "Mini Lop",
    "Holandês",
    "Gigante de Flandres",
    "Angorá",
    "Nova Zelândia",
    "Rex",
    "Mini Rex",
    "Califórnia",
    "Chinchila",
    "Lop Francês",
    "Borboleta",
    "Tan",
  ],
  "Porquinho-da-índia": [
    "Inglês",
    "Abissínio",
    "Peruano",
    "Sheltie",
    "Skinny",
    "Coronet",
    "Texel",
    "Alpaca",
    "Merino",
    "Crestado Americano",
    "Chinchila",
    "Standard",
    "Bege",
    "Branca",
    "Preta Velvet",
    "Safira",
    "Violeta",
    "Ébano",
    "Mosaico",
  ],
  Gerbil: ["Agouti", "Black", "Argente", "Sapphire", "Lilac", "Schimmel"],
  "Rato Twister": [
    "Dumbo",
    "Standard",
    "Rex",
    "Double Rex",
    "Hairless",
    "Tailless",
    "Satin",
  ],
  "Jabuti e Cágado": [
    "Jabuti-piranga",
    "Jabuti-tinga",
    "Tigre-d'água",
    "Cágado-de-barbicha",
    "Cágado-pescoço-de-cobra",
    "Muçuã",
  ],
  Gecko: [
    "Gecko-leopardo",
    "Crested Gecko",
    "Gecko-diurno",
    "Gecko-gárgula",
    "Tokay Gecko",
  ],
  Iguana: ["Iguana-verde", "Iguana-azul", "Iguana-vermelha"],
  Cobra: [
    "Corn Snake",
    "Piton-real",
    "Jiboia-constritora",
    "Falsa-coral",
    "Milk Snake",
    "Cobra-rei-da-califórnia",
    "Piton-carpete",
    "Piton-verde",
  ],
};

// Garante "Sem Raça Definida" (SRD) como PRIMEIRA opção em TODAS as espécies.
Object.keys(SPECIES_BREEDS).forEach((sp) => {
  const list = SPECIES_BREEDS[sp];
  if (!list.includes("Sem Raça Definida")) list.unshift("Sem Raça Definida");
});

// Ordena as raças alfabeticamente (pt-BR) UMA vez, aqui na definição, para que a
// referência de cada array permaneça estável. O dropdown de busca interna da lib
// captura `data` por closure e quebra se a referência mudar a cada render (a
// busca passa a filtrar contra a lista da 1ª montagem). Por isso NÃO se faz
// `.sort()` no `options` por render — ordena-se aqui, de forma estável. O SRD
// sempre fica em primeiro (independentemente da ordem alfabética).
Object.values(SPECIES_BREEDS).forEach((list) =>
  list.sort((a, b) => {
    const sa = a === "Sem Raça Definida" ? -1 : 0;
    const sb = b === "Sem Raça Definida" ? -1 : 0;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b, "pt-BR");
  }),
);

export const SPECIES_OPTIONS = Object.keys(SPECIES_BREEDS).sort((a, b) =>
  a.localeCompare(b, "pt-BR"),
);
export const NO_BREEDS: string[] = [];

export const normalizePhone = (value?: string | null) => {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.startsWith("55") ? digits.slice(2) : digits;
};

// Autoria por device ID (mais forte). Fallback de telefone para pets criados antes do deviceId existir.
export const isOwner = (
  pet: PetPost,
  myDeviceId: string,
  myPhone: string,
) =>
  (!!pet.ownerDeviceId && !!myDeviceId && pet.ownerDeviceId === myDeviceId) ||
  (myPhone !== "" && normalizePhone(pet.ownerPhone) === myPhone);

export const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

export const formatLostDate = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR");
};
