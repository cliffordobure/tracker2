import fs from 'fs';
import webpush from 'web-push';
import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { DeviceToken } from '../models/index.js';

let firebaseMessaging = null;
let firebaseInitAttempted = false;
let vapidReady = false;

function ensureFirebase() {
  if (firebaseMessaging) return firebaseMessaging;
  if (firebaseInitAttempted && !firebaseMessaging) return null;
  firebaseInitAttempted = true;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!json && !credPath) {
    console.warn(
      '[push] FCM disabled: set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS'
    );
    return null;
  }

  try {
    if (!getApps().length) {
      let credential;
      if (json) {
        const parsed = typeof json === 'string' ? JSON.parse(json) : json;
        credential = cert(parsed);
      } else if (credPath && fs.existsSync(credPath)) {
        credential = cert(JSON.parse(fs.readFileSync(credPath, 'utf8')));
      } else {
        credential = applicationDefault();
      }
      initializeApp({ credential });
    }
    firebaseMessaging = getMessaging();
    return firebaseMessaging;
  } catch (err) {
    console.warn('[push] FCM init failed:', err.message);
    return null;
  }
}

function ensureVapid() {
  if (vapidReady) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@schooltracker.test';
  if (!publicKey || !privateKey) {
    console.warn('[push] Web Push disabled: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
  return true;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

async function sendFcm(messaging, tokenDoc, payload) {
  const data = {};
  for (const [k, v] of Object.entries(payload.data || {})) {
    if (v != null) data[k] = String(v);
  }
  await messaging.send({
    token: tokenDoc.token,
    notification: { title: payload.title, body: payload.body },
    data,
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  });
}

async function sendWebPush(tokenDoc, payload) {
  if (!ensureVapid()) return;
  const subscription = {
    endpoint: tokenDoc.token,
    keys: {
      p256dh: tokenDoc.keys?.p256dh,
      auth: tokenDoc.keys?.auth,
    },
  };
  if (!subscription.keys.p256dh || !subscription.keys.auth) {
    throw new Error('Missing web push keys');
  }
  await webpush.sendNotification(
    subscription,
    JSON.stringify({
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    })
  );
}

export async function sendPushToUser(userId, payload) {
  const tokens = await DeviceToken.find({ userId });
  if (!tokens.length) return;

  const messaging = ensureFirebase();

  for (const doc of tokens) {
    try {
      if (doc.platform === 'fcm') {
        if (!messaging) continue;
        await sendFcm(messaging, doc, payload);
      } else if (doc.platform === 'web_push') {
        await sendWebPush(doc, payload);
      }
    } catch (err) {
      const status = err.statusCode || err.code || err.errorInfo?.code;
      const gone =
        status === 404 ||
        status === 410 ||
        status === 'messaging/registration-token-not-registered' ||
        status === 'messaging/invalid-registration-token';
      if (gone) {
        await DeviceToken.deleteOne({ _id: doc._id });
      } else {
        console.warn(`[push] send failed (${doc.platform}):`, err.message);
      }
    }
  }
}
