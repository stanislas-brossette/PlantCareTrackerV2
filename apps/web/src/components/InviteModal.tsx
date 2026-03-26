import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import { useInviteMember } from "../hooks/useGarden";
import toast from "react-hot-toast";
import type { EditableGardenRole } from "@plantcare/shared";

interface Props {
  gardenId: string;
  onClose: () => void;
}

export default function InviteModal({ gardenId, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<EditableGardenRole>("EDITOR");
  const invite = useInviteMember(gardenId);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    try {
      await invite.mutateAsync({ email: email.trim(), role });
      toast.success(`Invitation envoyée à ${email}`);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg || "Erreur lors de l'invitation");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-green-600" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Inviter un membre</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@example.com"
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rôle
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as EditableGardenRole)}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="EDITOR">Éditeur (peut modifier)</option>
              <option value="VIEWER">Lecteur (peut voir)</option>
            </select>
          </div>
        </div>

        <div className="p-4 pt-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={invite.isPending}
            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {invite.isPending ? "Envoi..." : "Inviter"}
          </button>
        </div>
      </div>
    </div>
  );
}
