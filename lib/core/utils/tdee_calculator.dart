import '../constants.dart';

/// Calculates Basal Metabolic Rate (BMR) and Total Daily Energy Expenditure (TDEE)
/// using the Mifflin-St Jeor formula, widely recognized as the most accurate clinical formula.
class TdeeCalculator {
  /// Calculates BMR using the Mifflin-St Jeor equation:
  /// - Male:   (10 × weight_kg) + (6.25 × height_cm) - (5 × age) + 5
  /// - Female: (10 × weight_kg) + (6.25 × height_cm) - (5 × age) - 161
  static double calculateBmr({
    required double weightKg,
    required double heightCm,
    required int age,
    required String sex, // 'male' or 'female'
  }) {
    if (weightKg <= 0 || heightCm <= 0 || age <= 0) {
      return 0.0;
    }
    final isMale = sex.trim().toLowerCase() == 'male';
    final base = (10.0 * weightKg) + (6.25 * heightCm) - (5.0 * age);
    return isMale ? base + 5.0 : base - 161.0;
  }

  /// Calculates TDEE from BMR and Activity Level multiplier
  static double calculateTdee({
    required double bmr,
    required String activityLevel,
  }) {
    final level = ActivityLevel.fromString(activityLevel);
    return bmr * level.multiplier;
  }

  /// Calculates the recommended daily calorie target based on goal and target rate (kg/week).
  ///
  /// Safe calorie floors are strictly enforced:
  /// - Male floor: 1,500 kcal
  /// - Female floor: 1,200 kcal
  static int calculateDailyTarget({
    required double tdee,
    required String goal,
    required double rateKgPerWeek,
    required String sex,
  }) {
    final isMale = sex.trim().toLowerCase() == 'male';
    final safeFloor = isMale
        ? AppConstants.minDailyCaloriesMale
        : AppConstants.minDailyCaloriesFemale;

    final goalType = GoalType.fromString(goal);
    // 1 kg of body fat is roughly 7,700 kcal, so 1 kg/week = ~1,100 kcal adjustment per day
    final dailyAdjustment = (rateKgPerWeek * (AppConstants.kcalPerKgFat / 7.0)).round();

    double target;
    switch (goalType) {
      case GoalType.lose:
        target = tdee - dailyAdjustment;
        break;
      case GoalType.gain:
        target = tdee + dailyAdjustment;
        break;
      case GoalType.maintain:
        target = tdee;
        break;
    }

    // Clamp to minimum safe floor
    final rounded = target.round();
    return rounded < safeFloor ? safeFloor : rounded;
  }
}
