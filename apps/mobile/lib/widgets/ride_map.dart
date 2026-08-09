import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../config.dart';
import '../theme/app_theme.dart';

class RideMap extends StatelessWidget {
  const RideMap({
    super.key,
    required this.center,
    this.busLocation,
    this.routePoints = const [],
    this.stops = const [],
    this.zoom = 14.5,
    this.mapController,
  });

  final LatLng center;
  final LatLng? busLocation;
  final List<LatLng> routePoints;
  final List<Map<String, dynamic>> stops;
  final double zoom;
  final MapController? mapController;

  @override
  Widget build(BuildContext context) {
    final markers = <Marker>[
      ...stops.map((stop) {
        final loc = stop['location'] as Map? ?? {};
        final lat = (loc['lat'] as num?)?.toDouble();
        final lng = (loc['lng'] as num?)?.toDouble();
        if (lat == null || lng == null) {
          return Marker(point: center, child: const SizedBox.shrink());
        }
        final isSchool = stop['type'] == 'school';
        return Marker(
          width: 44,
          height: 44,
          point: LatLng(lat, lng),
          child: _StopPin(label: '${(stop['order'] ?? 0)}', school: isSchool),
        );
      }),
      if (busLocation != null)
        Marker(
          width: 56,
          height: 56,
          point: busLocation!,
          child: const _BusMarker(),
        ),
    ];

    return FlutterMap(
      mapController: mapController,
      options: MapOptions(
        initialCenter: busLocation ?? center,
        initialZoom: zoom,
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
        ),
      ),
      children: [
        TileLayer(
          urlTemplate:
              'https://api.mapbox.com/styles/v1/${AppConfig.mapStyleId}/tiles/512/{z}/{x}/{y}@2x?access_token=${AppConfig.mapboxToken}',
          userAgentPackageName: 'com.schoolkids.school_kids_tracker',
          maxZoom: 20,
          tileDimension: 512,
          zoomOffset: -1,
        ),
        if (routePoints.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: routePoints,
                strokeWidth: 10,
                color: AppColors.route.withValues(alpha: 0.25),
                borderStrokeWidth: 0,
              ),
              Polyline(
                points: routePoints,
                strokeWidth: 5,
                color: AppColors.route,
              ),
            ],
          ),
        MarkerLayer(markers: markers),
      ],
    );
  }
}

class _BusMarker extends StatelessWidget {
  const _BusMarker();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(color: AppColors.ink, width: 2),
      ),
      child: const Center(
        child: Icon(Icons.directions_bus_filled_rounded, color: AppColors.ink, size: 26),
      ),
    );
  }
}

class _StopPin extends StatelessWidget {
  const _StopPin({required this.label, required this.school});
  final String label;
  final bool school;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: school ? AppColors.accent : const Color(0xFFEA580C),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.2),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          fontSize: 11,
        ),
      ),
    );
  }
}
