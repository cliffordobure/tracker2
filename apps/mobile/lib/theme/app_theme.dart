import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Bolt-inspired palette (green-first, not Uber black)
class AppColors {
  static const ink = Color(0xFF1A1A1A);
  static const muted = Color(0xFF6B7280);
  static const sheet = Color(0xFFFFFFFF);
  static const accent = Color(0xFF34D399); // Bolt green
  static const accentDark = Color(0xFF10B981);
  static const boltGreen = Color(0xFF2BEE8C);
  static const route = Color(0xFF1F2937);
  static const routeGlow = Color(0xFF34D399);
  static const danger = Color(0xFFEF4444);
  static const softBg = Color(0xFFF4F6F8);
  static const chip = Color(0xFFECFDF5);
}

ThemeData buildAppTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.accent,
      brightness: Brightness.light,
      primary: AppColors.accentDark,
    ),
  );

  return base.copyWith(
    textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
      bodyColor: AppColors.ink,
      displayColor: AppColors.ink,
    ),
    scaffoldBackgroundColor: Colors.white,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.softBg,
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: AppColors.accentDark, width: 1.6),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.boltGreen,
        foregroundColor: AppColors.ink,
        elevation: 0,
        minimumSize: const Size.fromHeight(56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(32)),
        textStyle: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        minimumSize: const Size.fromHeight(56),
        side: const BorderSide(color: Color(0xFFE5E7EB), width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(32)),
        textStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
  );
}
