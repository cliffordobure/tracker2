import 'package:flutter/material.dart';
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
  List<Map<String, dynamic>> kids = [];
  Map<String, dynamic>? active;
  List<LatLng> routePoints = [];
  LatLng? bus;
  String? status;
  bool loading = true;
  int followNonce = 0;

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
          if (data is Map && data['tripId'] == tripId && mounted) {
            setState(() {
              bus = LatLng(
                (data['lat'] as num).toDouble(),
                (data['lng'] as num).toDouble(),
              );
            });
          }
        });
        auth.sockets.socket?.on('kid:picked_up', (_) {
          if (!mounted) return;
          setState(() => status = 'Picked up');
          _load();
        });
        auth.sockets.socket?.on('kid:dropped_off', (_) {
          if (!mounted) return;
          setState(() => status = 'Dropped off');
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
    final center = bus ?? const LatLng(-1.3965, 36.7542);
    final trip = active == null ? null : Map<String, dynamic>.from(active!['trip'] as Map);
    final stops = active == null
        ? <Map<String, dynamic>>[]
        : List<Map<String, dynamic>>.from(active!['stops'] as List? ?? []);
    final live = trip != null;

    return Scaffold(
      body: Stack(
        children: [
          RideMap(
            center: center,
            busLocation: bus,
            routePoints: routePoints,
            stops: stops,
            followNonce: followNonce,
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Row(
                children: [
                  RoundMapButton(icon: Icons.menu_rounded, onTap: auth.logout),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FloatingPill(
                      child: Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: live ? AppColors.accent : AppColors.muted,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              live
                                  ? (trip['direction'] == 'to_school'
                                      ? 'On the way to school'
                                      : 'On the way home')
                                  : 'Where is the bus?',
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  RoundMapButton(
                    icon: Icons.my_location_rounded,
                    onTap: () => setState(() => followNonce++),
                  ),
                ],
              ),
            ),
          ),
          RideSheet(
            child: loading
                ? const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator(color: AppColors.ink)),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  live ? 'Your ride is live' : 'No active ride',
                                  style: const TextStyle(
                                    fontSize: 26,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.6,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  live
                                      ? '${trip['routeId'] is Map ? trip['routeId']['name'] : 'School route'} · tracking bus'
                                      : 'You’ll see the bus move here when the driver starts.',
                                  style: const TextStyle(color: AppColors.muted, height: 1.35),
                                ),
                              ],
                            ),
                          ),
                          if (status != null) StatusChip(text: status!),
                        ],
                      ),
                      const SizedBox(height: 18),
                      if (live)
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppColors.softBg,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 48,
                                height: 48,
                                decoration: BoxDecoration(
                                  color: AppColors.boltGreen,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: const Icon(Icons.directions_car_filled_rounded, color: AppColors.ink),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      trip['driverId'] is Map
                                          ? trip['driverId']['name'] ?? 'Driver'
                                          : 'School bus',
                                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                                    ),
                                    const Text(
                                      'Moving along the route',
                                      style: TextStyle(color: AppColors.muted, fontSize: 13),
                                    ),
                                  ],
                                ),
                              ),
                              const StatusChip(text: 'LIVE', color: AppColors.accentDark),
                            ],
                          ),
                        ),
                      const SizedBox(height: 16),
                      const Text('Your kids', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 10),
                      ...kids.map(
                        (k) => Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            border: Border.all(color: const Color(0xFFE5E7EB)),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Row(
                            children: [
                              CircleAvatar(
                                backgroundColor: AppColors.accent.withValues(alpha: 0.2),
                                child: Text(
                                  ((k['name'] as String?)?.isNotEmpty == true
                                          ? (k['name'] as String)[0]
                                          : '?')
                                      .toUpperCase(),
                                  style: const TextStyle(fontWeight: FontWeight.w800),
                                ),
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
                                text: live ? 'On trip' : 'Idle',
                                color: live ? AppColors.accentDark : AppColors.muted,
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      BoltPrimaryButton(label: 'Refresh', onPressed: _load),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
