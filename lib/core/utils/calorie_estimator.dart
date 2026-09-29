import '../constants.dart';

/// Fallback calorie calculation engine when Health Connect data is unavailable
/// or only step data is available.
class CalorieEstimator {
  /// Estimates total calories burned today using steps + baseline BMR.
  ///
  /// Formula: BMR + (steps × caloriesPerStep)
  /// If [hoursPassedToday] is provided, BMR can be adjusted proportionally to the time of day,
  /// otherwise full-day BMR is assumed.
  static double estimateTotalCaloriesBurned({
    required int steps,
    required double bmr,
    double? hoursPassedToday,
  }) {
    if (bmr <= 0) return 0.0;

    // If partial day, prorate BMR by hours passed / 24, minimum 0.1
    final bmrPortion = hoursPassedToday != null
        ? (bmr * (hoursPassedToday.clamp(0.0, 24.0) / 24.0))
        : bmr;

    final activeBurnFromSteps = steps * AppConstants.caloriesPerStep;
    return (bmrPortion + activeBurnFromSteps).roundToDouble();
  }

  /// Calculates a calorie range when confidence is below threshold.
  /// Low confidence produces a ±20% estimate range.
  static ({int low, int high, bool isRange}) getCalorieRange(double calories, double? confidence) {
    final conf = confidence ?? 1.0;
    if (conf >= AppConstants.lowConfidenceThreshold) {
      return (low: calories.round(), high: calories.round(), isRange: false);
    }
    final low = (calories * 0.80).round();
    final high = (calories * 1.20).round();
    return (low: low, high: high, isRange: true);
  }

  /// Formats calorie display string with estimate label and range if applicable
  static String formatCalorieString(double calories, {double? confidence}) {
    final range = getCalorieRange(calories, confidence);
    if (range.isRange) {
      return '~${range.low}-${range.high} kcal (est.)';
    }
    return '~${range.low} kcal (est.)';
  }
}
