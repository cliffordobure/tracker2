import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../firebase_options.dart';
import 'api_client.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (_) {}
}

class PushService {
  PushService._();
  static final PushService instance = PushService._();

  final _local = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  String? _token;

  Future<void> init() async {
    if (_ready) return;
    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    } catch (e) {
      debugPrint('[push] Firebase init skipped: $e');
      return;
    }

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _local.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
    );

    final androidPlugin = _local.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        'schoolkids_alerts',
        'SchoolKids alerts',
        description: 'Trip and pickup alerts for parents',
        importance: Importance.high,
      ),
    );

    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);

    FirebaseMessaging.onMessage.listen(_showForeground);
    _ready = true;
  }

  Future<void> _showForeground(RemoteMessage message) async {
    final n = message.notification;
    final title = n?.title ?? message.data['title']?.toString() ?? 'SchoolKids';
    final body = n?.body ?? message.data['body']?.toString() ?? '';
    await _local.show(
      message.hashCode,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'schoolkids_alerts',
          'SchoolKids alerts',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
    );
  }

  Future<void> registerParentToken(ApiClient api) async {
    if (!_ready) await init();
    if (!_ready) return;
    try {
      final messaging = FirebaseMessaging.instance;
      if (Platform.isIOS) {
        await messaging.getAPNSToken();
      }
      final token = await messaging.getToken();
      if (token == null || token.isEmpty) return;
      _token = token;
      await api.post('/parent/device-tokens', {
        'platform': 'fcm',
        'token': token,
        'userAgent': Platform.operatingSystem,
      });
      messaging.onTokenRefresh.listen((t) async {
        _token = t;
        try {
          await api.post('/parent/device-tokens', {
            'platform': 'fcm',
            'token': t,
            'userAgent': Platform.operatingSystem,
          });
        } catch (_) {}
      });
    } catch (e) {
      debugPrint('[push] register failed: $e');
    }
  }

  Future<void> unregister(ApiClient api) async {
    final token = _token;
    if (token == null) return;
    try {
      await api.delete('/parent/device-tokens', {
        'platform': 'fcm',
        'token': token,
      });
    } catch (_) {}
    _token = null;
  }
}
