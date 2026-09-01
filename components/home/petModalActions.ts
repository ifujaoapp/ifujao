import { type BarAction } from "./PetDetailBase";
import { type PetRecord } from "@/lib/storage";

export interface PetActionCtx {
  selectedPet: PetRecord;
  setSelectedPet: (p: PetRecord | null) => void;
  pets: PetRecord[];
  commitPets: (pets: PetRecord[]) => void;
  isOwn: boolean;
  godMode: boolean;
  myDeviceId?: string | null;
  reportPet: (p: PetRecord) => void;
  sharePetCard: (p: PetRecord) => void;
  deletePet: (id: string) => void;
  handleContact: (p: PetRecord) => void;
}

export const buildShareAction = (ctx: PetActionCtx): BarAction => ({
  key: "share",
  icon: "share-social",
  label: "Compartilhar",
  color: "#6E6E73",
  iconColor: "#6E6E73",
  textColor: "#48484A",
  reportedDisabled: true,
  confirmedDisabled: true,
  onPress: () => ctx.sharePetCard(ctx.selectedPet),
});

export const buildReportAction = (ctx: PetActionCtx): BarAction | null =>
  !ctx.selectedPet.reported && !ctx.isOwn
    ? {
        key: "report",
        icon: "flag",
        label: "Denunciar",
        color: "#FF9500",
        iconColor: "#FF9500",
        textColor: "#48484A",
        confirmedDisabled: true,
        onPress: () => ctx.reportPet(ctx.selectedPet),
      }
    : null;

export const buildDeleteAction = (ctx: PetActionCtx): BarAction | null =>
  ctx.isOwn || ctx.godMode
    ? {
        key: "delete",
        icon: "trash",
        label: ctx.godMode && !ctx.isOwn ? "Apagar (mod)" : "Apagar",
        color: "#FF3B30",
        iconColor: "#FF3B30",
        textColor: "#FF3B30",
        onPress: () => ctx.deletePet(ctx.selectedPet.id),
      }
    : null;

export const buildUndoReportAction = (ctx: PetActionCtx): BarAction | null =>
  ctx.selectedPet.reported && !!ctx.myDeviceId && ctx.selectedPet.reporterDeviceId === ctx.myDeviceId
    ? {
        key: "undoReport",
        icon: "flag",
        label: "Apagar denúncia",
        color: "#0A84FF",
        iconColor: "#0A84FF",
        textColor: "#0A84FF",
        onPress: () => {
          ctx.commitPets(
            ctx.pets.map((p) =>
              p.id === ctx.selectedPet.id
                ? {
                    ...p,
                    reported: false,
                    reportReason: undefined,
                    reportedBy: undefined,
                    dirty: true,
                  }
                : p,
            ),
          );
          ctx.setSelectedPet(null);
        },
      }
    : null;

export const buildUnfoundAction = (ctx: PetActionCtx): BarAction => ({
  key: "unfound",
  icon: "close-circle",
  label: "Desmarcar encontrado",
  color: "#8E8E93",
  iconColor: "#FFFFFF",
  textColor: "#FFFFFF",
  bgColor: "#8E8E93",
  primary: true,
  onPress: () => {
    const id = ctx.selectedPet.id;
    ctx.commitPets(
      ctx.pets.map((p) => (p.id === id ? { ...p, foundAt: undefined, dirty: true } : p)),
    );
    ctx.setSelectedPet(null);
  },
});

export const buildFoundMarkAction = (
  ctx: PetActionCtx,
): { top?: BarAction; secondary?: BarAction } => {
  if (!(ctx.isOwn || ctx.godMode)) return {};
  // Não mostra "Marcar como encontrado" se o pet já está encontrado ou é um post de achado
  if (ctx.selectedPet.foundAt || ctx.selectedPet.postType === 'found') return {};
  const foundAction: BarAction = {
    key: "found",
    icon: "checkmark-circle",
    label: "Marcar como encontrado",
    color: "#34C759",
    iconColor: "#FFFFFF",
    textColor: "#FFFFFF",
    bgColor: "#34C759",
    primary: ctx.isOwn,
    onPress: () => {
      const id = ctx.selectedPet.id;
      ctx.commitPets(
        ctx.pets.map((p) =>
          p.id === id ? { ...p, foundAt: new Date().toISOString(), dirty: true } : p,
        ),
      );
      ctx.setSelectedPet(null);
    },
  };
  return ctx.isOwn ? { top: foundAction } : { secondary: foundAction };
};

export const buildContactAction = (
  ctx: PetActionCtx,
  label: string,
  hidden: boolean,
): BarAction | null =>
  ctx.isOwn || hidden
    ? null
    : {
        key: "contact",
        icon: "logo-whatsapp",
        label,
        color: "#128C7E",
        primary: true,
        reportedDisabled: true,
        onPress: () => {
          const pet = ctx.selectedPet;
          ctx.setSelectedPet(null);
          ctx.handleContact(pet);
        },
      };
