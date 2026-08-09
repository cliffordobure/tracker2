import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';
import 'push_service.dart';
import 'socket_service.dart';

class AuthState extends ChangeNotifier {
  AuthState() {
    _bootstrap();
  }

  final api = ApiClient();
  final sockets = SocketService();

  Map<String, dynamic>? user;
  bool loading = true;
  String? error;

  String? get role => user?['role'] as String?;
  String? get name => user?['name'] as String?;
  bool get isLoggedIn => user != null && api.token != null;

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token == null) {
      loading = false;
      notifyListeners();
      return;
    }
    api.token = token;
    try {
      final data = await api.get('/auth/me');
      user = Map<String, dynamic>.from(data['user'] as Map);
      sockets.connect(token);
      if (user?['role'] == 'parent') {
        await PushService.instance.registerParentToken(api);
      }
    } catch (_) {
      await prefs.remove('token');
      api.token = null;
      user = null;
    }
    loading = false;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    error = null;
    notifyListeners();
    try {
      final data = await api.post('/auth/login', {
        'email': email.trim(),
        'password': password,
      });
      final token = data['token'] as String;
      api.token = token;
      user = Map<String, dynamic>.from(data['user'] as Map);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', token);
      sockets.connect(token);
      if (user?['role'] == 'parent') {
        await PushService.instance.registerParentToken(api);
      }
      notifyListeners();
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();
      rethrow;
    }
  }

  Future<void> logout() async {
    if (user?['role'] == 'parent') {
      await PushService.instance.unregister(api);
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    api.token = null;
    user = null;
    sockets.disconnect();
    notifyListeners();
  }
}
