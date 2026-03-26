import { useEffect, useState } from "react";
import {
  Users, MapPin, Bell, BellOff, Plus, Trash2,
  ChevronRight, Moon, Sun, UserCircle, Loader2,
} from "lucide-react";
import { useGardens, useMembers, useRemoveMember, useLocations, useCreateLocation, useDeleteLocation } from "../hooks/useGarden";
import { useAuthStore } from "../stores/auth";
import InviteModal from "../components/InviteModal";
import { isPushSubscribed, subscribeToPush, unsubscribeFromPush } from "../lib/notifications";
import toast from "react-hot-toast";
import api from "../lib/api";

export default function Settings() {
  const { user, activeGardenId, setActiveGarden, setUser } = useAuthStore();
  const { data: gardens = [] } = useGardens();
  const { data: members = [] } = useMembers(activeGardenId);
  const { data: locations = [] } = useLocations(activeGardenId);
  const removeMember = useRemoveMember(activeGardenId);
  const createLocation = useCreateLocation(activeGardenId);
  const deleteLocation = useDeleteLocation(activeGardenId);

  const [showInvite, setShowInvite] = useState(false);
  const [newLocName, setNewLocName] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    let cancelled = false;

    async function syncPushState() {
      try {
        const subscribed = await isPushSubscribed();
        if (!cancelled) {
          setPushEnabled(subscribed);
        }
      } catch {
        if (!cancelled) {
          setPushEnabled(false);
        }
      }
    }

    syncPushState();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleDark = () => {
    document.documentElement.classList.toggle("dark");
    setDarkMode(!darkMode);
    localStorage.setItem("theme", !darkMode ? "dark" : "light");
  };

  const handlePushToggle = async () => {
    setPushLoading(true);
    try {
      if (!pushEnabled) {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          toast.error("Notifications refusées");
          return;
        }
        const ok = await subscribeToPush();
        if (ok) { setPushEnabled(true); toast.success("Notifications activées 🔔"); }
        else toast.error("Push non supporté sur ce navigateur");
      } else {
        await unsubscribeFromPush();
        setPushEnabled(false);
        toast.success("Notifications désactivées");
      }
    } catch {
      toast.error("Erreur lors de la configuration des notifications");
    } finally {
      setPushLoading(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocName.trim()) return;
    await createLocation.mutateAsync(newLocName.trim());
    setNewLocName("");
    toast.success(`Emplacement "${newLocName}" créé`);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await api.patch("/auth/me", { name });
      setUser(res.data);
      toast.success("Profil mis à jour");
    } catch {
      toast.error("Erreur");
    } finally {
      setSavingProfile(false);
    }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );

  const Row = ({ icon: Icon, label, onClick, danger }: {
    icon: React.ElementType; label: string; onClick?: () => void; danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${danger ? "text-red-600" : "text-gray-700 dark:text-gray-300"}`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1 text-left text-sm">{label}</span>
      <ChevronRight className="w-4 h-4 text-gray-300" />
    </button>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Réglages</h1>

      {/* Profile */}
      <Section title="Mon profil">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <UserCircle className="w-10 h-10 text-green-600" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{user?.name ?? "Sans nom"}</p>
              <p className="text-xs text-gray-400">{user?.email}</p>
            </div>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Votre prénom"
            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="w-full bg-green-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
            Sauvegarder
          </button>
        </div>
      </Section>

      {/* Garden selector */}
      {gardens.length > 1 && (
        <Section title="Jardin actif">
          <div className="p-3 space-y-2">
            {gardens.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveGarden(g.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  g.id === activeGardenId
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                🌿 {g.name}
                <span className="ml-2 text-xs text-gray-400">({g.plantCount} plantes)</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Members */}
      <Section title="Membres du jardin">
        <div className="divide-y divide-gray-50 dark:divide-gray-700">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <UserCircle className="w-8 h-8 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {m.user.name ?? m.user.email}
                </p>
                <p className="text-xs text-gray-400 capitalize">{m.role.toLowerCase()}</p>
              </div>
              {m.userId !== user?.id && m.role !== "OWNER" && (
                <button
                  onClick={() => removeMember.mutate(m.userId)}
                  className="p-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-gray-50 dark:border-gray-700">
          <button
            onClick={() => setShowInvite(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-green-400 text-green-600 rounded-xl text-sm hover:bg-green-50 dark:hover:bg-green-900/20"
          >
            <Users className="w-4 h-4" />
            Inviter un membre
          </button>
        </div>
      </Section>

      {/* Locations */}
      <Section title="Emplacements">
        <div className="divide-y divide-gray-50 dark:divide-gray-700">
          {locations.map((loc) => (
            <div key={loc.id} className="flex items-center gap-3 px-4 py-3">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{loc.name}</span>
              <button
                onClick={() => deleteLocation.mutate(loc.id)}
                className="p-1 text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 flex gap-2 border-t border-gray-50 dark:border-gray-700">
          <input
            type="text"
            value={newLocName}
            onChange={(e) => setNewLocName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddLocation()}
            placeholder="Salon, Cuisine..."
            className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={handleAddLocation}
            className="bg-green-600 text-white p-2 rounded-xl hover:bg-green-700"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </Section>

      {/* Preferences */}
      <Section title="Préférences">
        <button
          onClick={toggleDark}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {darkMode ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-500" />}
          <span className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300">
            {darkMode ? "Mode clair" : "Mode sombre"}
          </span>
        </button>
        <button
          onClick={handlePushToggle}
          disabled={pushLoading}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-t border-gray-50 dark:border-gray-700"
        >
          {pushEnabled ? (
            <BellOff className="w-5 h-5 text-orange-500" />
          ) : (
            <Bell className="w-5 h-5 text-green-500" />
          )}
          <span className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300">
            {pushEnabled ? "Désactiver les notifications" : "Activer les notifications"}
          </span>
          {pushLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </button>
      </Section>

      {showInvite && activeGardenId && (
        <InviteModal gardenId={activeGardenId} onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
}
