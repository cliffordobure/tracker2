import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../services/auth_state.dart';
import '../services/directions.dart';
import '../theme/app_theme.dart';
import '../utils/geo.dart';
import '../widgets/ride_map.dart';
import '../widgets/ride_sheet.dart';

class TeacherHomeScreen extends StatefulWidget {
  const TeacherHomeScreen({super.key});

  @override
  State<TeacherHomeScreen> createState() => _TeacherHomeScreenState();
}

class _TeacherHomeScreenState extends State<TeacherHomeScreen> {
  Map<String, dynamic>? school;
  List<Map<String, dynamic>> kids = [];
  List<Map<String, dynamic>> activeTrips = [];
  Map<String, dynamic>? selected;
  List<LatLng> routePoints = [];
  LatLng? bus;
  bool loading = true;
  String? error;
  int followNonce = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await auth.api.get('/teacher/overview');
      school = data['school'] == null ? null : Map<String, dynamic>.from(data['school'] as Map);
      kids = List<Map<String, dynamic>>.from(data['kids'] as List? ?? []);
      activeTrips = List<Map<String, dynamic>>.from(data['activeTrips'] as List? ?? []);
      selected = activeTrips.isNotEmpty ? activeTrips.first : null;
      await _bindSelected();
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _bindSelected() async {
    final auth = context.read<AuthState>();
    if (selected == null) {
      routePoints = [];
      bus = null;
      return;
    }
    final trip = Map<String, dynamic>.from(selected!['trip'] as Map);
    final stops = List<Map<String, dynamic>>.from(selected!['stops'] as List? ?? []);
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
          bus = LatLng((data['lat'] as num).toDouble(), (data['lng'] as num).toDouble());
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final center = bus ?? latLngFrom(school?['location']) ?? const LatLng(-1.3965, 36.7542);
    final stops = selected == null
        ? <Map<String, dynamic>>[]
        : List<Map<String, dynamic>>.from(selected!['stops'] as List? ?? []);
    final trip = selected == null ? null : Map<String, dynamic>.from(selected!['trip'] as Map);

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
                      child: Text(
                        school?['name'] ?? 'School rides',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                        overflow: TextOverflow.ellipsis,
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
                ? const Center(child: CircularProgressIndicator(color: AppColors.ink))
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (error != null) ...[
                        Text(error!, style: const TextStyle(color: AppColors.danger)),
                        const SizedBox(height: 8),
                        const Text(
                          'Redeploy backend for teacher routes if this fails on Render.',
                          style: TextStyle(color: AppColors.muted, fontSize: 12),
                        ),
                        const SizedBox(height: 12),
                      ],
                      Text(
                        trip == null ? 'No buses live' : 'Live school transport',
                        style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        trip == null
                            ? '${kids.length} students · waiting for drivers'
                            : '${trip['routeId'] is Map ? trip['routeId']['name'] : 'Route'} is moving now',
                        style: const TextStyle(color: AppColors.muted),
                      ),
                      if (activeTrips.length > 1) ...[
                        const SizedBox(height: 14),
                        Wrap(
                          spacing: 8,
                          children: activeTrips.map((t) {
                            final tr = Map<String, dynamic>.from(t['trip'] as Map);
                            final selectedId = trip?['_id'];
                            return ChoiceChip(
                              selected: selectedId == tr['_id'],
                              label: Text(tr['routeId'] is Map ? tr['routeId']['name'] : 'Trip'),
                              onSelected: (_) async {
                                setState(() => selected = t);
                                await _bindSelected();
                                setState(() {});
                              },
                            );
                          }).toList(),
                        ),
                      ],
                      const SizedBox(height: 16),
                      BoltPrimaryButton(label: 'Refresh', onPressed: _load),
                      const SizedBox(height: 16),
                      Text(
                        '${kids.length} students',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                      ),
                      const SizedBox(height: 8),
                      ...kids.take(10).map(
                            (k) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: CircleAvatar(
                                backgroundColor: AppColors.softBg,
                                child: Text(
                                  ((k['name'] as String?)?.isNotEmpty == true
                                          ? (k['name'] as String)[0]
                                          : '?')
                                      .toUpperCase(),
                                  style: const TextStyle(fontWeight: FontWeight.w800),
                                ),
                              ),
                              title: Text(k['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text(k['grade'] ?? ''),
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
