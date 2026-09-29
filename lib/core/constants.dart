import 'package:flutter/material.dart';

abstract final class AppConstants {
  /// The Gemini model used for food analysis and daily summaries.
  /// Change this single constant to upgrade or swap models.
  static const String geminiModel = 'gemini-3.5-flash';

  /// Safe daily calorie floors - the app never suggests targets below these
  static const int minDailyCaloriesMale = 1500;
  static const int minDailyCaloriesFemale = 1200;

  /// Default calorie target fallback
  static const int defaultDailyCalories = 2000;

  /// Approximate calorie value for 1 kg of body fat (~7700 kcal).
  /// A target rate of 1 kg/week corresponds to ~1100 kcal daily adjustment (7700 / 7).
  static const double kcalPerKgFat = 7700.0;

  /// Estimated calories burned per step above resting BMR
  static const double caloriesPerStep = 0.045;

  /// Rate limiting parameters for Cloud Functions proxy
  static const int maxPhotoAnalysesPerHour = 30;
  static const int maxSummariesPerHour = 10;

  /// Low confidence threshold for calorie estimate ranges (below this, show range)
  static const double lowConfidenceThreshold = 0.60;
}

enum MealType {
  breakfast('Breakfast', '🌅', Icons.wb_twilight),
  lunch('Lunch', '☀️', Icons.wb_sunny_outlined),
  dinner('Dinner', '🌙', Icons.nightlight_round),
  snack('Snack', '🍎', Icons.restaurant_outlined);

  final String label;
  final String emoji;
  final IconData icon;

  const MealType(this.label, this.emoji, this.icon);

  static MealType fromString(String val) {
    return MealType.values.firstWhere(
      (m) => m.name.toLowerCase() == val.toLowerCase() || m.label.toLowerCase() == val.toLowerCase(),
      orElse: () => MealType.snack,
    );
  }
}

enum ActivityLevel {
  sedentary('Sedentary', 'Little or no exercise, desk job', 1.2),
  light('Lightly Active', 'Light exercise 1-3 days/week', 1.375),
  moderate('Moderately Active', 'Moderate exercise 3-5 days/week', 1.55),
  active('Very Active', 'Heavy exercise 6-7 days/week', 1.725),
  veryActive('Extra Active', 'Very heavy exercise, physical job', 1.9);

  final String label;
  final String description;
  final double multiplier;

  const ActivityLevel(this.label, this.description, this.multiplier);

  static ActivityLevel fromString(String val) {
    return ActivityLevel.values.firstWhere(
      (a) => a.name.toLowerCase() == val.toLowerCase() || a.label.toLowerCase() == val.toLowerCase(),
      orElse: () => ActivityLevel.moderate,
    );
  }
}

enum GoalType {
  lose('Weight Loss', 'Burn more calories than you consume', -1),
  maintain('Maintain Weight', 'Keep energy intake equal to expenditure', 0),
  gain('Weight Gain', 'Build mass with a caloric surplus', 1);

  final String label;
  final String description;
  final int direction;

  const GoalType(this.label, this.description, this.direction);

  static GoalType fromString(String val) {
    return GoalType.values.firstWhere(
      (g) => g.name.toLowerCase() == val.toLowerCase() || g.label.toLowerCase() == val.toLowerCase(),
      orElse: () => GoalType.maintain,
    );
  }
}
