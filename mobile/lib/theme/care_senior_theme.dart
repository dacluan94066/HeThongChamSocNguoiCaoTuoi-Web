import 'package:flutter/material.dart';

/// Shared visual language for the elderly mobile experience.
abstract final class CareSeniorColors {
  static const primary = Color(0xff278d63);
  static const deepGreen = Color(0xff185a49);
  static const mint = Color(0xffeaf7f1);
  static const background = Color(0xfff7faf8);
  static const surface = Colors.white;
  static const border = Color(0xffddebe4);
  static const text = Color(0xff17352a);
  static const secondaryText = Color(0xff60756a);
  static const warning = Color(0xffa9650b);
  static const warningSurface = Color(0xfffff3df);
  static const danger = Color(0xffc9281c);
  static const dangerSurface = Color(0xffffeeeb);
}

abstract final class CareSeniorTheme {
  static ThemeData get data {
    final scheme = ColorScheme.fromSeed(
      seedColor: CareSeniorColors.primary,
      primary: CareSeniorColors.deepGreen,
      surface: CareSeniorColors.surface,
      error: CareSeniorColors.danger,
    );
    return ThemeData(
      useMaterial3: true,
      fontFamily: 'Arial',
      colorScheme: scheme,
      scaffoldBackgroundColor: CareSeniorColors.background,
      appBarTheme: const AppBarTheme(
        backgroundColor: CareSeniorColors.background,
        foregroundColor: CareSeniorColors.text,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: CareSeniorColors.text,
          fontSize: 22,
          fontWeight: FontWeight.w800,
        ),
      ),
      textTheme: const TextTheme(
        headlineSmall: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w800,
          color: CareSeniorColors.text,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w800,
          color: CareSeniorColors.text,
        ),
        titleMedium: TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w700,
          color: CareSeniorColors.text,
        ),
        bodyLarge: TextStyle(fontSize: 17, color: CareSeniorColors.text),
        bodyMedium: TextStyle(fontSize: 16, color: CareSeniorColors.text),
        bodySmall: TextStyle(
          fontSize: 14,
          color: CareSeniorColors.secondaryText,
        ),
      ),
      cardTheme: CardThemeData(
        color: CareSeniorColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: CareSeniorColors.border),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: CareSeniorColors.deepGreen,
          foregroundColor: Colors.white,
          minimumSize: const Size(56, 56),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: CareSeniorColors.deepGreen,
          minimumSize: const Size(56, 56),
          side: const BorderSide(color: CareSeniorColors.border),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xfff1f8f3),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 18,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: CareSeniorColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: CareSeniorColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(
            color: CareSeniorColors.primary,
            width: 2,
          ),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: CareSeniorColors.surface,
        selectedColor: CareSeniorColors.mint,
        side: const BorderSide(color: CareSeniorColors.border),
        labelStyle: const TextStyle(
          fontSize: 15,
          color: CareSeniorColors.text,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      tabBarTheme: const TabBarThemeData(
        labelColor: CareSeniorColors.deepGreen,
        unselectedLabelColor: CareSeniorColors.secondaryText,
        indicatorColor: CareSeniorColors.primary,
        dividerColor: CareSeniorColors.border,
        labelStyle: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
        unselectedLabelStyle: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: CareSeniorColors.border,
        thickness: 1,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: CareSeniorColors.primary,
      ),
    );
  }
}
