import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Top-down car marker in the style of Bolt ride apps.
class BoltCarMarker extends StatelessWidget {
  const BoltCarMarker({
    super.key,
    required this.bearing,
    required this.pulse,
  });

  final double bearing;
  final double pulse;

  @override
  Widget build(BuildContext context) {
    final ring = 1 + (pulse < 0.5 ? pulse : 1 - pulse) * 0.45;

    return Stack(
      alignment: Alignment.center,
      children: [
        Transform.scale(
          scale: ring,
          child: Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.boltGreen.withValues(alpha: 0.22),
            ),
          ),
        ),
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.boltGreen.withValues(alpha: 0.35),
          ),
        ),
        Transform.rotate(
          angle: bearing * math.pi / 180,
          child: CustomPaint(
            size: const Size(52, 52),
            painter: _BoltCarPainter(),
          ),
        ),
      ],
    );
  }
}

class _BoltCarPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;

    // Soft drop shadow under car
    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: 0.22)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, cy + 2), width: 22, height: 38),
        const Radius.circular(8),
      ),
      shadow,
    );

    // Car body (pointing up = forward)
    final bodyRect = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset(cx, cy), width: 20, height: 36),
      const Radius.circular(7),
    );
    final bodyPaint = Paint()..color = AppColors.boltGreen;
    canvas.drawRRect(bodyRect, bodyPaint);

    // Slight darker side panels
    final sidePaint = Paint()..color = AppColors.accentDark;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(cx - 10, cy - 10, 3.5, 20),
        const Radius.circular(2),
      ),
      sidePaint,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(cx + 6.5, cy - 10, 3.5, 20),
        const Radius.circular(2),
      ),
      sidePaint,
    );

    // Windshield (front)
    final glassPaint = Paint()..color = const Color(0xFF0F172A).withValues(alpha: 0.85);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, cy - 8), width: 13, height: 8),
        const Radius.circular(3),
      ),
      glassPaint,
    );

    // Rear window
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, cy + 9), width: 12, height: 6.5),
        const Radius.circular(2.5),
      ),
      glassPaint,
    );

    // Roof highlight
    final roofPaint = Paint()..color = Colors.white.withValues(alpha: 0.35);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, cy + 0.5), width: 11, height: 7),
        const Radius.circular(2),
      ),
      roofPaint,
    );

    // Headlights
    final lightPaint = Paint()..color = Colors.white;
    canvas.drawCircle(Offset(cx - 5.5, cy - 16.5), 1.6, lightPaint);
    canvas.drawCircle(Offset(cx + 5.5, cy - 16.5), 1.6, lightPaint);

    // White outline for map contrast
    final border = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawRRect(bodyRect, border);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
