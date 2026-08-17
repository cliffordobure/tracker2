import { api } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerParentWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  const { vapidPublicKey } = await api('/parent/push-config');
  const key = vapidPublicKey || import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, reason: 'no_vapid' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const reg = await navigator.serviceWorker.register('/sw-push.js');
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  const json = sub.toJSON();
  await api('/parent/device-tokens', {
    method: 'POST',
    body: {
      platform: 'web_push',
      token: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      userAgent: navigator.userAgent,
    },
  });
  localStorage.setItem('webPushEndpoint', json.endpoint);
  return { ok: true, endpoint: json.endpoint };
}

export async function unregisterParentWebPush() {
  const endpoint = localStorage.getItem('webPushEndpoint');
  try {
    if (endpoint) {
      await api('/parent/device-tokens', {
        method: 'DELETE',
        body: { platform: 'web_push', token: endpoint },
      });
    }
  } catch {
    /* ignore */
  }
  localStorage.removeItem('webPushEndpoint');
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw-push.js');
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    /* ignore */
  }
}

export function notificationTypeLabel(type) {
  switch (type) {
    case 'trip_started':
      return 'Trip started';
    case 'kid_picked_up':
      return 'Picked up';
    case 'kid_dropped_off':
      return 'Dropped off';
    case 'trip_completed':
      return 'Completed';
    case 'trip_cancelled':
      return 'Cancelled';
    case 'trip_assigned':
      return 'Assigned';
    case 'late_pickup_request':
      return 'Late pickup';
    case 'assignment':
      return 'Assignment';
    case 'teacher_note':
      return 'From teacher';
    case 'attendance_alert':
      return 'Attendance';
    case 'diary':
      return 'Class diary';
    default:
      return type || 'Alert';
  }
}
