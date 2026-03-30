import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import toast from "react-hot-toast";
import MonthlyFreqEditor from "../components/MonthlyFreqEditor";
import IdentifyModal from "../components/IdentifyModal";
import { usePlant, usePlants } from "../hooks/usePlants";
import { useCreateLocation, useLocations } from "../hooks/useGarden";
import { db, queueAction } from "../lib/db";
import { uploadPhotoDataUrl as uploadPhotoAsset } from "../lib/photos";
import { useOfflineStore } from "../stores/offline";

function resizeImage(file: File, maxSize = 800): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ratio = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.88);
    };
    img.src = URL.createObjectURL(file);
  });
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(dataUrl: string, filename: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

export default function PlantForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id && id !== "new");
  const navigate = useNavigate();
  const isOnline = useOfflineStore((s) => s.isOnline);

  const { data: existing } = usePlant(isEdit ? id : undefined);
  const { createPlant, updatePlant } = usePlants();
  const { data: locations = [] } = useLocations();
  const createLocation = useCreateLocation();

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [waterDays, setWaterDays] = useState("");
  const [fertDays, setFertDays] = useState("");
  const [waterByMonth, setWaterByMonth] = useState<number[] | null>(null);
  const [fertByMonth, setFertByMonth] = useState<number[] | null>(null);
  const [locationId, setLocationId] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showIdentifyModal, setShowIdentifyModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existing && isEdit) {
      setName(existing.name);
      setNotes(existing.notes ?? "");
      setWaterDays(existing.wateringFreqDays?.toString() ?? "");
      setFertDays(existing.fertilizingFreqDays?.toString() ?? "");
      setWaterByMonth(existing.wateringFreqByMonth ?? null);
      setFertByMonth(existing.fertilizingFreqByMonth ?? null);
      setLocationId(existing.locationId ?? "");
      setPhotoPreview(existing.cachedPhotoUrl ?? existing.photoUrl ?? null);
    }
  }, [existing, isEdit]);

  const processPhotoFile = async (file: File) => {
    setPhotoFile(file);
    setShowIdentifyModal(true);
    setProcessingPhoto(true);
    try {
      const resized = await resizeImage(file);
      const dataUrl = await fileToDataUrl(resized);
      setPendingPhotoDataUrl(dataUrl);
      setPhotoPreview(dataUrl);
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await processPhotoFile(file);
    } finally {
      e.target.value = "";
    }
  };

  const handleTakePhoto = async () => {
    try {
      const capture = await CapacitorCamera.getPhoto({
        quality: 88,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      if (!capture.dataUrl) {
        toast.error("Aucune photo reçue");
        return;
      }

      const file = await dataUrlToFile(capture.dataUrl, `plant-${Date.now()}.jpg`);
      await processPhotoFile(file);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("cancel")) {
        return;
      }
      toast.error("Impossible d'ouvrir l'appareil photo");
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Le nom est requis");
      return;
    }

    setSaving(true);
    try {
      let resolvedLocationId = locationId;
      if (newLocation.trim()) {
        const loc = await createLocation.mutateAsync(newLocation.trim());
        resolvedLocationId = loc.id;
      }

      const payload = {
        name: name.trim(),
        notes: notes.trim() || undefined,
        wateringFreqDays: waterDays ? parseInt(waterDays, 10) : undefined,
        fertilizingFreqDays: fertDays ? parseInt(fertDays, 10) : undefined,
        wateringFreqByMonth: waterByMonth ?? undefined,
        fertilizingFreqByMonth: fertByMonth ?? undefined,
        locationId: resolvedLocationId || undefined,
      };

      let plantId: string;
      if (isEdit && id) {
        await updatePlant.mutateAsync({ id, ...payload });
        plantId = id;
      } else {
        const plant = await createPlant.mutateAsync(payload);
        plantId = plant.id;
      }

      if (pendingPhotoDataUrl) {
        await db.plants.update(plantId, { cachedPhotoUrl: pendingPhotoDataUrl });
        if (isOnline) {
          await uploadPhotoDataUrlForPlant(plantId, pendingPhotoDataUrl, photoFile?.name ?? "plant.jpg");
        } else {
          await queueAction({
            kind: "UPLOAD_PHOTO",
            payload: {
              plantId,
              photoDataUrl: pendingPhotoDataUrl,
              filename: photoFile?.name ?? "plant.jpg",
            },
          });
        }
      }

      toast.success(isEdit ? "Plante mise à jour" : "Plante ajoutée");
      navigate(isEdit ? `/plants/${plantId}` : "/");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const uploadPhotoDataUrlForPlant = async (plantId: string, photoDataUrl: string, filename: string) => {
    const finalPhotoUrl = await uploadPhotoAsset(plantId, photoDataUrl, filename);
    await db.plants.update(plantId, { photoUrl: finalPhotoUrl, cachedPhotoUrl: photoDataUrl });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="truncate font-bold text-lg text-gray-900 dark:text-white">
            {isEdit ? "Modifier la plante" : "Nouvelle plante"}
          </h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex flex-shrink-0 items-center justify-center gap-2 rounded-full bg-[#0b6b5d] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#053c35]/10 hover:bg-[#09584d] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Enregistrer
        </button>
      </div>

      <div
        className="relative flex h-48 w-full items-center justify-center overflow-hidden rounded-2xl bg-emerald-50 dark:bg-emerald-950/40"
      >
        {photoPreview ? (
          <img src={photoPreview} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-[#0b6b5d] dark:text-amber-200">
            <Camera className="w-10 h-10 mx-auto mb-2" />
            <p className="text-sm font-medium">Ajouter une photo</p>
          </div>
        )}
        {processingPhoto && (
          <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full bg-black/60 text-white px-3 py-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Optimisation de la photo...
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            void handleTakePhoto();
          }}
          className="flex items-center justify-center gap-2 rounded-2xl bg-[#0b6b5d] px-4 py-3 text-sm font-medium text-white hover:bg-[#09584d] disabled:opacity-50"
          disabled={processingPhoto}
        >
          <Camera className="h-4 w-4" />
          Prendre une photo
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-700 dark:hover:bg-gray-700"
          disabled={processingPhoto}
        >
          <Camera className="h-4 w-4" />
          Bibliothèque
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhoto}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhoto}
      />

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-4 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Monstera, Pothos..."
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Conseils d'entretien..."
            rows={4}
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
          />
        </div>

        <MonthlyFreqEditor
          label="Arrosage (jours entre chaque)"
          emoji="💧"
          value={waterByMonth}
          scalarValue={waterDays}
          onChangeMonthly={setWaterByMonth}
          onChangeScalar={setWaterDays}
        />
        <MonthlyFreqEditor
          label="Fertilisation (jours entre chaque)"
          emoji="🌿"
          value={fertByMonth}
          scalarValue={fertDays}
          onChangeMonthly={setFertByMonth}
          onChangeScalar={setFertDays}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">📍 Emplacement</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="">Sans emplacement</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ou créer un emplacement</label>
          <input
            type="text"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="Salon, Cuisine..."
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
          />
        </div>
      </div>

      {showIdentifyModal && photoFile && isOnline && (
        <IdentifyModal
          imageFile={photoFile}
          plantName={name.trim() || "cette plante"}
          onApplyName={(value) => {
            setName(value);
            toast.success("Nom appliqué");
          }}
          onApplyDetails={(value) => {
            setNotes(value);
            toast.success("Détails appliqués");
          }}
          onApplyPlanning={(planning) => {
            setWaterByMonth(planning.wateringFreqByMonth);
            setFertByMonth(planning.fertilizingFreqByMonth);
            setWaterDays(planning.wateringFreqDays?.toString() ?? "");
            setFertDays(planning.fertilizingFreqDays?.toString() ?? "");
            toast.success("Plannings appliqués");
          }}
          onClose={() => setShowIdentifyModal(false)}
        />
      )}
    </div>
  );
}
