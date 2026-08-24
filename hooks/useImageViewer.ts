import { useCallback, useState } from "react";

export function useImageViewer() {
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  const openInViewer = useCallback((images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(Math.max(0, Math.min(index, images.length - 1)));
    setViewerVisible(true);
  }, []);

  return {
    viewerImages,
    setViewerImages,
    viewerIndex,
    setViewerIndex,
    viewerVisible,
    setViewerVisible,
    openInViewer,
  };
}
