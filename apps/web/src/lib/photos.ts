import { db } from "./db";
import api from "./api";
import { resolveAssetUrl } from "./serverConfig";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read blob"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

export async function cachePhotoForPlant(plantId: string, photoUrl: string | null) {
  if (!photoUrl) {
    await db.plants.update(plantId, { cachedPhotoUrl: null });
    return null;
  }

  const absoluteUrl = resolveAssetUrl(photoUrl);
  if (!absoluteUrl) return null;

  const response = await fetch(absoluteUrl);
  if (!response.ok) {
    throw new Error(`Photo download failed: ${response.status}`);
  }

  const dataUrl = await blobToDataUrl(await response.blob());
  await db.plants.update(plantId, { cachedPhotoUrl: dataUrl });
  return dataUrl;
}

export async function cacheAllPlantPhotos() {
  const plants = await db.plants.toArray();
  await Promise.all(
    plants
      .filter((plant) => plant.photoUrl)
      .map((plant) => cachePhotoForPlant(plant.id, plant.photoUrl))
  );
}

export async function uploadPhotoDataUrl(plantId: string, photoDataUrl: string, filename: string) {
  const response = await fetch(photoDataUrl);
  const blob = await response.blob();
  const form = new FormData();
  form.append("file", new File([blob], filename, { type: blob.type || "image/jpeg" }));
  const res = await api.post<{ photoUrl: string }>(`/plants/${plantId}/photo`, form);
  await db.plants.update(plantId, {
    photoUrl: res.data.photoUrl,
    cachedPhotoUrl: photoDataUrl,
  });
  return res.data.photoUrl;
}
