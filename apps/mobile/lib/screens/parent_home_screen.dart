import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../services/auth_state.dart';
import '../services/directions.dart';
import '../theme/app_theme.dart';
import '../utils/geo.dart';
import '../widgets/ride_map.dart';
import '../widgets/ride_sheet.dart';

class ParentHomeScreen extends StatefulWidget {
  const ParentHomeScreen({super.key});

  @override
  State<ParentHomeScreen> createState() => _ParentHomeScreenState();
}

class _ParentHomeScreenState extends State<ParentHomeScreen> {
  final mapController = MapController();
  List<Map<String, dynamic>> kids = [];
  Map<String, dynamic>? active;
  List<LatLng> routePoints = [];
  LatLng? bus;
  String? status;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    setState(() => loading = true);
    try {
      final kidsRes = await auth.api.get('/parent/kids');
      final activeRes = await auth.api.get('/parent/trips/active');
      kids = List<Map<String, dynamic>>.from(kidsRes['kids'] as List? ?? []);
      final trips = List<Map<String, dynamic>>.from(activeRes['trips'] as List? ?? []);
      active = trips.isNotEmpty ? trips.first : null;

      if (active != null) {
        final trip = Map<String, dynamic>.from(active!['trip'] as Map);
        final stops = List<Map<String, dynamic>>.from(active!['stops'] as List? ?? []);
        final ordered = orderedStops(stops, trip['direction'] as String?);
        routePoints = await fetchRoadRoute(stopLatLngs(ordered));
        bus = latLngFrom(trip['latestLocation']) ??
            (routePoints.isNotEmpty ? routePoints.first : null);

        final tripId = trip['_id'] as String;
        auth.sockets.joinTrip(tripId);
        auth.sockets.socket?.off('location:update');
        auth.sockets.socket?.on('location:update', (data) {
          if (data is Map && data['tripId'] == tripId) {
            final next = LatLng(
              (data['lat'] as num).toDouble(),
              (data['lng'] as num).toDouble(),
            );
            setState(() => bus = next);
            mapController.move(next, mapController.camera.zoom);
          }
        });
        auth.sockets.socket?.on('kid:picked_up', (_) {
          setState(() => status = 'Your child was picked up');
          _load();
        });
        auth.sockets.socket?.on('kid:dropped_off', (_) {
          setState(() => status = 'Your child was dropped off');
          _load();
        });
      } else {
        routePoints = [];
        bus = null;
      }
    } catch (e) {
      status = e.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final center = bus ??
        latLngFrom(kids.isNotEmpty ? (kids.first['schoolId'] is Map ? kids.first['schoolId']['location'] : null) : null) ??
        const LatLng(-1.3965, 36.7542);

    final trip = active == null ? null : Map<String, dynamic>.from(active!['trip'] as Map);
    final stops = active == null
        ? <Map<String, dynamic>>[]
        : List<Map<String, dynamic>>.from(active!['stops'] as List? ?? []);

    return Scaffold(
      body: Stack(
        children: [
          RideMap(
            mapController: mapController,
            center: center,
            busLocation: bus,
            routePoints: routePoints,
            stops: stops,
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(
                children: [
                  _RoundIcon(
                    icon: Icons.logout_rounded,
                    onTap: () => auth.logout(),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.12),
                          blurRadius: 16,
                        ),
                      ],
                    ),
                    child: Text(
                      auth.name ?? 'Parent',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _RoundIcon(icon: Icons.refresh_rounded, onTap: _load),
                ],
              ),
            ),
          ),
          RideSheet(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (status != null) ...[
                        StatusChip(text: status!),
                        const SizedBox(height: 10),
                      ],
                      Text(
                        trip == null ? 'No active ride' : 'Live ride',
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        trip == null
                            ? 'You will see the bus here when the driver starts a trip.'
                            : '${trip['routeId'] is Map ? trip['routeId']['name'] : 'Route'} · '
                                '${trip['direction'] == 'to_school' ? 'To school' : 'Going home'}',
                        style: const TextStyle(color: AppColors.muted, height: 1.35),
                      ),
                      const SizedBox(height: 16),
                      ...kids.map(
                        (k) => Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: AppColors.softBg,
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Row(
                            children: [
                              CircleAvatar(
                                backgroundColor: AppColors.accent.withValues(alpha: 0.15),
                                child: const Icon(Icons.child_care, color: AppColors.accent),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(k['name'] ?? 'Child',
                                        style: const TextStyle(fontWeight: FontWeight.w700)),
                                    Text(
                                      k['routeId'] is Map ? k['routeId']['name'] ?? '' : '',
                                      style: const TextStyle(color: AppColors.muted, fontSize: 13),
                                    ),
                                  ],
                                ),
                              ),
                              StatusChip(
                                text: trip == null ? 'Waiting' : 'Tracking',
                                color: trip == null ? AppColors.muted : AppColors.accent,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon({required this.icon, required this.onTap});
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
