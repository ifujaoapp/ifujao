import { showAlert } from "@/src/components/AppAlert";
import {
  CameraType,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { isDevice } from "expo-device";
import { useCallback, useRef, useState } from "react";
import { MAX_IMAGE_BYTES, MAX_IMAGES } from "@/constants/breeds";

const getFileSize = async (uri: string): Promise<number | null> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? (info.size ?? null) : null;
  } catch {
    return null;
  }
};

const redimensionarPara1080p = async (uri: string): Promise<string> => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return uri;
  }
};

const filtrarPorTamanho = async (
  uris: string[],
  fileSizes?: (number | null)[],
): Promise<string[]> => {
  const aceitas: string[] = [];
  const rejeitadas: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const size = fileSizes?.[i] ?? (await getFileSize(uri));
    if (size != null && size > MAX_IMAGE_BYTES)
      rejeitadas.push(`${size} B`);
    else aceitas.push(uri);
  }
  if (rejeitadas.length > 0) {
    // textos de tamanho formatados no chamador, se necessário
  }
  return aceitas;
};

export function usePetCamera() {
  const [images, setImages] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPhotoSourceVisible, setIsPhotoSourceVisible] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");
  const [cameraReady, setCameraReady] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [flash, setFlash] = useState<"off" | "on" | "auto">("off");
  const cameraRef = useRef<CameraView>(null);
  const [, requestCameraPermission] = useCameraPermissions();

  const abrirCamera = useCallback(async () => {
    fecharFonte();
    const { granted } = await requestCameraPermission();
    if (!granted) {
      showAlert(
        "permission",
        "Permissão Negada",
        "Precisamos de permissão para acessar a câmera.",
      );
      return;
    }
    setCameraReady(false);
    setZoom(0);
    setIsCameraOpen(true);
  }, [requestCameraPermission]);

  const escolherFonte = useCallback(() => setIsPhotoSourceVisible(true), []);
  const fecharFonte = useCallback(() => setIsPhotoSourceVisible(false), []);

  const abrirGaleria = useCallback(async () => {
    fecharFonte();
    if (images.length >= MAX_IMAGES) {
      showAlert(
        "warning",
        "Limite atingido",
        `Você pode adicionar no máximo ${MAX_IMAGES} fotos.`,
      );
      return;
    }
    let assets: { uri: string; fileSize?: number | null }[] | null = null;
    if (isDevice) {
      const { granted } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        showAlert(
          "permission",
          "Permissão Negada",
          "Precisamos de permissão para acessar sua galeria.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES - images.length,
      });
      if (!result.canceled) {
        assets = result.assets.map((a) => ({
          uri: a.uri,
          fileSize: a.fileSize ?? null,
        }));
      }
    } else {
      try {
        const res = await DocumentPicker.getDocumentAsync({
          type: "image/*",
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (!res.canceled && res.assets?.length) {
          assets = res.assets.map((a: any) => ({
            uri: a.uri,
            fileSize: a.size ?? null,
          }));
        }
      } catch (e) {
        console.warn("[camera] document picker falhou:", e);
      }
    }
    if (assets && assets.length > 0) {
      const uris = assets.map((a) => a.uri);
      const redimensionadas = await Promise.all(uris.map(redimensionarPara1080p));
      const sizes = assets.map((a) => a.fileSize ?? null);
      const aceitas = await filtrarPorTamanho(redimensionadas, sizes);
      if (aceitas.length > 0) {
        setImages((prev) => [...prev, ...aceitas].slice(0, MAX_IMAGES));
      }
    }
  }, [images.length]);

  const zoomStep = 0.1;
  const zoomIn = useCallback(
    () => setZoom((prev) => Math.min(prev + zoomStep, 1)),
    [],
  );
  const zoomOut = useCallback(
    () => setZoom((prev) => Math.max(prev - zoomStep, 0)),
    [],
  );

  const flashModes: ("off" | "on" | "auto")[] = ["off", "on", "auto"];
  const toggleFlash = useCallback(
    () =>
      setFlash(
        (prev) => flashModes[(flashModes.indexOf(prev) + 1) % flashModes.length],
      ),
    [],
  );

  const tirarFoto = useCallback(async () => {
    if (!cameraRef.current || !cameraReady) return;
    if (images.length >= MAX_IMAGES) {
      showAlert(
        "warning",
        "Limite atingido",
        `Você pode adicionar no máximo ${MAX_IMAGES} fotos.`,
      );
      return;
    }
    const foto = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    const redimensionada = await redimensionarPara1080p(foto.uri);
    const aceitas = await filtrarPorTamanho([redimensionada]);
    if (aceitas.length > 0) {
      setImages((prev) => [...prev, aceitas[0]]);
    }
  }, [cameraReady, images.length]);

  const removerFoto = useCallback((uri: string) => {
    setImages((prev) => prev.filter((item) => item !== uri));
  }, []);

  return {
    images,
    setImages,
    isCameraOpen,
    setIsCameraOpen,
    isPhotoSourceVisible,
    setIsPhotoSourceVisible,
    facing,
    setFacing,
    cameraReady,
    setCameraReady,
    zoom,
    setZoom,
    flash,
    setFlash,
    cameraRef,
    requestCameraPermission,
    abrirCamera,
    escolherFonte,
    fecharFonte,
    abrirGaleria,
    zoomIn,
    zoomOut,
    toggleFlash,
    tirarFoto,
    removerFoto,
  };
}
