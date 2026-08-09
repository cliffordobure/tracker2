import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import '../config.dart';

Future<List<LatLng>> fetchRoadRoute(List<LatLng> waypoints) async {
  if (waypoints.length < 2) return waypoints;
  final pairs = waypoints.map((w) => '${w.longitude},${w.latitude}').toList();
  final res = await http.get(Uri.parse(AppConfig.directionsUrl(pairs)));
  if (res.statusCode != 200) return waypoints;
  final data = jsonDecode(res.body) as Map<String, dynamic>;
  final coords = data['routes']?[0]?['geometry']?['coordinates'] as List?;
  if (coords == null) return waypoints;
  return coords
      .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
      .toList();
}
