import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../services/auth_state.dart';
import '../services/directions.dart';
import '../theme/app_theme.dart';
import '../utils/geo.dart';
import '../widgets/ride_map.dart';
import '../widgets/ride_sheet.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  final mapController = MapController();
  List<Map<String, dynamic>> routes = [];
  Map<String, dynamic>? trip;
  List<Map<String, dynamic>> kids = [];
  List<Map<String, dynamic>> stops = [];
  List<Map<String, dynamic>> events = [];
  List<LatLng> routePoints = [];
  LatLng? bus;
  int routeIndex = 0;
  bool loading = true;
  String? message;
  StreamSubscription<Position>? gpsSub;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    gpsSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    setState(() => loading = true);
    try {
      final data = await auth.api.get('/driver/routes');
      routes = List<Map<String, dynamic>>.from(data['routes'] as List? ?? []);
      final active = await auth.api.get('/driver/trips/active');
      if (active['trip'] != null) {
        await _openTrip(Map<String, dynamic>.from(active['trip'] as Map));
      }
    } catch (e) {
      message = e.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _openTrip(Map<String, dynamic> t) async {
    final auth = context.read<AuthState>();
    final detail = await auth.api.get('/trips/${t['_id']}');
    trip = Map<String, dynamic>.from(detail['trip'] as Map);
    stops = List<Map<String, dynamic>>.from(detail['stops'] as List? ?? []);
    events = List<Map<String, dynamic>>.from(detail['events'] as List? ?? []);
    kids = List<Map<String, dynamic>>.from(trip!['kidIds'] as List? ?? []);
    final ordered = orderedStops(stops, trip!['direction'] as String?);
    routePoints = await fetchRoadRoute(stopLatLngs(ordered));
    bus = latLngFrom(trip!['latestLocation']) ??
        (routePoints.isNotEmpty ? routePoints.first : null);
    routeIndex = 0;
    await _startGps();
    setState(() {});
  }

  Future<void> _startTrip(String routeId, String direction) async {
    final auth = context.read<AuthState>();
    try {
      final created = await auth.api.post('/trips', {
        'routeId': routeId,
        'direction': direction,
      });
      await _openTrip(Map<String, dynamic>.from(created['trip'] as Map));
      message = 'Trip started';
      setState(() {});
    } catch (e) {
      setState(() => message = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _startGps() async {
    final auth = context.read<AuthState>();
    final permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return;
    }
    await gpsSub?.cancel();
    gpsSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 8,
      ),
    ).listen((pos) async {
      final next = LatLng(pos.latitude, pos.longitude);
      setState(() => bus = next);
      mapController.move(next, mapController.camera.zoom);
      if (trip != null) {
        try {
          await auth.api.post('/trips/${trip!['_id']}/location', {
            'lat': next.latitude,
            'lng': next.longitude,
            'heading': pos.heading,
            'speed': pos.speed,
          });
        } catch (_) {}
      }
    });
  }

  Future<void> _simulateAlongRoute() async {
    if (trip == null || routePoints.length < 2) return;
    final auth = context.read<AuthState>();
    routeIndex = (routeIndex + 4).clamp(0, routePoints.length - 1);
    final next = routePoints[routeIndex];
    setState(() => bus = next);
    mapController.move(next, 15.2);
    await auth.api.post('/trips/${trip!['_id']}/location', {
      'lat': next.latitude,
      'lng': next.longitude,
    });
  }

  bool _hasEvent(String kidId, String type) => events.any((e) {
        final id = e['kidId'] is Map ? e['kidId']['_id'] : e['kidId'];
        return id == kidId && e['type'] == type;
      });

  Future<void> _pickup(String kidId) async {
    final auth = context.read<AuthState>();
    final res = await auth.api.post('/trips/${trip!['_id']}/kids/$kidId/pickup');
    events.add(Map<String, dynamic>.from(res['event'] as Map));
    setState(() => message = 'Kid picked up');
  }

  Future<void> _dropoff(String kidId) async {
    final auth = context.read<AuthState>();
    final res = await auth.api.post('/trips/${trip!['_id']}/kids/$kidId/dropoff');
    events.add(Map<String, dynamic>.from(res['event'] as Map));
    setState(() => message = 'Kid dropped off');
  }

  Future<void> _complete() async {
    final auth = context.read<AuthState>();
    await auth.api.post('/trips/${trip!['_id']}/complete');
    await gpsSub?.cancel();
    setState(() {
      trip = null;
      kids = [];
      stops = [];
      events = [];
      routePoints = [];
      bus = null;
      message = 'Trip completed';
    });
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final center = bus ?? const LatLng(-1.3965, 36.7542);

    return Scaffold(
      body: Stack(
        children: [
          RideMap(
            mapController: mapController,
            center: center,
            busLocation: bus,
            routePoints: routePoints,
            stops: stops,
            zoom: 14.8,
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(
                children: [
                  _IconBtn(icon: Icons.logout_rounded, onTap: auth.logout),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.ink,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: const Text(
                      'Driver mode',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
          ),
          RideSheet(
            maxHeightFactor: 0.62,
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : trip == null
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Ready to drive',
                              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          const Text('Start a morning or evening trip on your route.',
                              style: TextStyle(color: AppColors.muted)),
                          if (message != null) ...[
                            const SizedBox(height: 10),
                            StatusChip(text: message!),
                          ],
                          const SizedBox(height: 16),
                          ...routes.map((r) {
                            return Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: AppColors.softBg,
                                borderRadius: BorderRadius.circular(18),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(r['name'] ?? 'Route',
                                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${(r['kids'] as List?)?.length ?? 0} kids assigned',
                                    style: const TextStyle(color: AppColors.muted),
                                  ),
                                  const SizedBox(height: 12),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: ElevatedButton(
                                          onPressed: () => _startTrip(r['_id'], 'to_school'),
                                          child: const Text('Morning'),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: OutlinedButton(
                                          style: OutlinedButton.styleFrom(
                                            minimumSize: const Size.fromHeight(54),
                                            shape: RoundedRectangleBorder(
                                              borderRadius: BorderRadius.circular(28),
                                            ),
                                          ),
                                          onPressed: () => _startTrip(r['_id'], 'to_home'),
                                          child: const Text('Evening'),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          }),
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  trip!['routeId'] is Map
                                      ? trip!['routeId']['name']
                                      : 'Active trip',
                                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                                ),
                              ),
                              StatusChip(
                                text: trip!['direction'] == 'to_school' ? 'To school' : 'To home',
                              ),
                            ],
                          ),
                          if (message != null) ...[
                            const SizedBox(height: 8),
                            StatusChip(text: message!),
                          ],
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: _simulateAlongRoute,
                                  child: const Text('Simulate move'),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: ElevatedButton(
                                  onPressed: _complete,
                                  child: const Text('Complete'),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          const Text('Kids on board',
                              style: TextStyle(fontWeight: FontWeight.w800)),
                          const SizedBox(height: 8),
                          ...kids.map((kid) {
                            final id = kid['_id'] as String? ?? kid.toString();
                            final name = kid['name'] as String? ?? 'Kid';
                            final picked = _hasEvent(id, 'picked_up');
                            final dropped = _hasEvent(id, 'dropped_off');
                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppColors.softBg,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(name,
                                            style: const TextStyle(fontWeight: FontWeight.w700)),
                                        Text(
                                          dropped
                                              ? 'Dropped off'
                                              : picked
                                                  ? 'On the bus'
                                                  : 'Waiting',
                                          style: const TextStyle(color: AppColors.muted, fontSize: 12),
                                        ),
                                      ],
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: picked ? null : () => _pickup(id),
                                    child: const Text('Pick up'),
                                  ),
                                  TextButton(
                                    onPressed: (!picked || dropped) ? null : () => _dropoff(id),
                                    child: const Text('Drop off'),
                                  ),
                                ],
                              ),
                            );
                          }),
                        ],
                      ),
          ),
        ],
      ),
    );
  }
}

class _IconBtn extends StatelessWidget {
  const _IconBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 3,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(width: 44, height: 44, child: Icon(icon, size: 20)),
      ),
    );
  }
}
