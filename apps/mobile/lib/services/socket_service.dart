import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config.dart';

class SocketService {
  io.Socket? _socket;

  io.Socket? get socket => _socket;

  void connect(String token) {
    disconnect();
    _socket = io.io(
      AppConfig.apiBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .build(),
    );
    _socket!.connect();
  }

  void joinTrip(String tripId) => _socket?.emit('trip:join', tripId);
  void leaveTrip(String tripId) => _socket?.emit('trip:leave', tripId);

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
