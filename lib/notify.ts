import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { PetRecord } from "./storage";

// Mostra o alerta mesmo com o app em primeiro plano (no iOS o handler é
// obrigatório para exibir notificações locais enquanto o app está aberto).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let channelReady = false;
const ensureChannel = async () => {
  if (Platform.OS !== "android" || channelReady) return;
  try {
    await Notifications.setNotificationChannelAsync("ifujao-matches", {
      name: "Matches de pets",
      importance: Notifications.AndroidImportance.HIGH,
    });
    channelReady = true;
  } catch {
    // Canal opcional; segue sem ele se falhar.
  }
};

// Solicita permissão de notificação (barra do sistema). Chamar uma vez no boot.
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
};

// Dispara uma notificação local na barra do celular avisando sobre um match
// pendente. `asFinder` = true quando quem está sendo avisado é o dono do achado
// (alguém reivindicou o pet que ele encontrou). Só funciona com o app aberto
// ou em segundo plano — app fechado não dispara (sem FCM/socket).
export const notifyMatchRequest = async (
  pet: PetRecord,
  asFinder: boolean,
): Promise<void> => {
  try {
    await ensureChannel();
    const title = asFinder
      ? "Alguém reivindicou seu achado"
      : "Seu pet pode ter sido encontrado!";
    const body = asFinder
      ? `O dono de "${pet.name || pet.species}" acha que é o pet que você encontrou.`
      : `O dono de "${pet.name || pet.species}" reconheceu seu achado como o pet dele.`;
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {
    // Sem permissão ou falha de scheduling: silencioso.
  }
};
