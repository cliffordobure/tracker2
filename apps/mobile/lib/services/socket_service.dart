import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config.dart';

typedef SocketHandler = void Function(dynamic data);

class SocketService {
  io.Socket? _socket;
  final Set<String> _joinedTrips = {};
  final Map<String, List<SocketHandler>> _handlers = {};

  io.Socket? get socket => _socket;
  bool get connected => _socket?.connected == true;

  void connect(String token) {
    disconnect();
    _socket = io.io(
      AppConfig.apiBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          .enableReconnection()
          .setAuth({'token': token})
          .build(),
    );

    _socket!
      ..onConnect((_) {
        for (final tripId in _joinedTrips) {
          _socket?.emit('trip:join', tripId);
        }
      })
      ..onReconnect((_) {
        for (final tripId in _joinedTrips) {
          _socket?.emit('trip:join', tripId);
        }
      });

    // Re-bind any handlers registered before connect completed
    for (final entry in _handlers.entries) {
      for (final handler in entry.value) {
        _socket!.on(entry.key, handler);
      }
    }

    _socket!.connect();
  }

  void on(String event, SocketHandler handler) {
    _handlers.putIfAbsent(event, () => []).add(handler);
    _socket?.on(event, handler);
  }

  void off(String event, [SocketHandler? handler]) {
    if (handler == null) {
      _handlers.remove(event);
      _socket?.off(event);
      return;
    }
    _handlers[event]?.remove(handler);
    _socket?.off(event, handler);
  }

  void joinTrip(String tripId) {
    if (tripId.isEmpty) return;
    _joinedTrips.add(tripId);
    _socket?.emit('trip:join', tripId);
  }

  void leaveTrip(String tripId) {
    _joinedTrips.remove(tripId);
    _socket?.emit('trip:leave', tripId);
  }

  void leaveAllTrips() {
    for (final tripId in [..._joinedTrips]) {
      leaveTrip(tripId);
    }
  }

  void disconnect() {
    _joinedTrips.clear();
    _socket?.dispose();
    _socket = null;
  }
}
