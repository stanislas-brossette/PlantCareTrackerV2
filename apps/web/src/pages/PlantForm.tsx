import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import { usePlant, usePlants } from "../hooks/usePlants";
import { useLocations, useCreateLocation } from "../hooks/useGarden";
import { useAuthStore } from "../stores/auth";
import MonthlyFreqEditor from "../components/MonthlyFreqEditor";
import toast from "react-hot-toast";
import api from "../lib/api";

function resizeImage(file: File, maxSize = 600): Promise<Blob> {
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

export default function PlantForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = id && id !== "new";
  const navigate = useNavigate();
  const { activeGardenId } = useAuthStore();

  const { data: existing } = usePlant(isEdit ? id : undefined);
  const { createPlant, updatePlant } = usePlants(activeGardenId);
  const { data: locations = [] } = useLocations(activeGardenId);
  const createLocation = useCreateLocation(activeGardenId);

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
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existing && isEdit) {
      console.log("[PlantForm] existing.wateringFreqByMonth:", existing.wateringFreqByMonth);
      console.log("[PlantForm] existing.fertilizingFreqByMonth:", existing.fertilizingFreqByMonth);
      setName(existing.name);
      setNotes(existing.notes ?? "");
      setWaterDays(existing.wateringFreqDays?.toString() ?? "");
      setFertDays(existing.fertilizingFreqDays?.toString() ?? "");
      setWaterByMonth(existing.wateringFreqByMonth ?? null);
      setFertByMonth(existing.fertilizingFreqByMonth ?? null);
      setLocationId(existing.locationId ?? "");
      if (existing.photoUrl) setPhotoPreview(existing.photoUrl);
    }
  }, [existing, isEdit]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const resized = await resizeImage(file);
    const resizedFile = new File([resized], file.name, { type: "image/jpeg" });
    setPhotoFile(resizedFile);
    setPhotoPreview(URL.createObjectURL(resized));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Le nom est requis");
      return;
    }
    if (!activeGardenId) return;
    setSaving(true);

    try {
      let resolvedLocationId = locationId;

      // Create new location if entered
      if (newLocation.trim()) {
        const loc = await createLocation.mutateAsync(newLocation.trim());
        resolvedLocationId = loc.id;
      }

      const payload = {
        name: name.trim(),
        notes: notes.trim() || undefined,
        wateringFreqDays: waterDays ? parseInt(waterDays) : undefined,
        fertilizingFreqDays: fertDays ? parseInt(fertDays) : undefined,
        wateringFreqByMonth: waterByMonth ?? undefined,
        fertilizingFreqByMonth: fertByMonth ?? undefined,
        locationId: resolvedLocationId || undefined,
      };

      let plantId: string;
      if (isEdit && id) {
        await updatePlant.mutateAsync({ id, ...payload });
        plantId = id;
        toast.success("Plante mise à jour");
      } else {
        const plant = await createPlant.mutateAsync({ gardenId: activeGardenId, ...payload });
        plantId = plant.id;
        toast.success("Plante ajoutée 🌱");
      }

      // Upload photo if selected
      if (photoFile && plantId) {
        const form = new FormData();
        form.append("file", photoFile);
        await api.post(`/plants/${plantId}/photo`, form);
      }

      navigate(isEdit ? `/plants/${id}` : "/");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-lg text-gray-900 dark:text-white">
          {isEdit ? "Modifier la plante" : "Nouvelle plante"}
        </h1>
      </div>

      {/* Photo */}
      <div
        className="relative w-full h-48 rounded-2xl overflow-hidden bg-green-100 dark:bg-green-900 cursor-pointer flex items-center justify-center"
        onClick={() => fileRef.current?.click()}
      >
        {photoPreview ? (
          <img src={photoPreview} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-green-600 dark:text-green-400">
            <Camera className="w-10 h-10 mx-auto mb-2" />
            <p className="text-sm font-medium">Ajouter une photo</p>
          </div>
        )}
        <div className="absolute bottom-2 right-2 bg-white dark:bg-gray-800 rounded-full p-1.5 shadow">
          <Camera className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-4 shadow-sm">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Monstera, Pothos..."
            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Conseils d'entretien..."
            rows={3}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
        </div>

        {/* Frequencies */}
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

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            📍 Emplacement
          </label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Sans emplacement</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>

        {/* New location shortcut */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Ou créer un emplacement
          </label>
          <input
            type="text"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="Salon, Cuisine, Balcon..."
            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full bg-green-600 text-white py-3 rounded-2xl font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 text-base"
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
        {isEdit ? "Enregistrer les modifications" : "Ajouter la plante"}
      </button>
    </div>
  );
}
