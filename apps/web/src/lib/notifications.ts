import api from "./api";

export async function getVapidKey(): Promise<string | null> {
  try {
    const res = await api.get<{ key: string | null; enabled: boolean }>("/push/vapid-public-key");
    return res.data.key;
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  const vapidKey = await getVapidKey();
  if (!vapidKey) return false;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await sendSubToServer(existing);
    return true;
  }

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  await sendSubToServer(sub);
  return true;
}

async function sendSubToServer(sub: PushSubscription) {
  const json = sub.toJSON();
  await api.post("/push/subscribe", {
    endpoint: sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  if (sub) {
    await api.delete("/push/unsubscribe", { data: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}
