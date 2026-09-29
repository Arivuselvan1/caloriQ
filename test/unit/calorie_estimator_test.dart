import 'package:flutter_test/flutter_test.dart';
import 'package:caloriq/core/constants.dart';
import 'package:caloriq/core/utils/calorie_estimator.dart';

void main() {
  group('CalorieEstimator Tests', () {
    test('Calculates fallback burn using BMR and steps', () {
      const bmr = 1800.0;
      const steps = 10000;
      // 1800 + (10000 * 0.045) = 1800 + 450 = 2250.0
      final burned = CalorieEstimator.estimateTotalCaloriesBurned(
        steps: steps,
        bmr: bmr,
      );
      expect(burned, equals(2250.0));
    });

    test('Zero steps burns full daily resting BMR', () {
      const bmr = 1600.0;
      final burned = CalorieEstimator.estimateTotalCaloriesBurned(
        steps: 0,
        bmr: bmr,
      );
      expect(burned, equals(1600.0));
    });

    test('High confidence estimate returns exact point value (not a range)', () {
      final range = CalorieEstimator.getCalorieRange(500.0, 0.85);
      expect(range.isRange, isFalse);
      expect(range.low, equals(500));
      expect(range.high, equals(500));
    });

    test('Low confidence (< 0.60) returns ±20% range', () {
      final range = CalorieEstimator.getCalorieRange(500.0, 0.45);
      expect(range.isRange, isTrue);
      // 500 * 0.8 = 400, 500 * 1.2 = 600
      expect(range.low, equals(400));
      expect(range.high, equals(600));
    });

    test('Formats low-confidence calorie string with range and estimate label', () {
      final formatted = CalorieEstimator.formatCalorieString(300.0, confidence: 0.50);
      // 300 * 0.8 = 240, 300 * 1.2 = 360 -> "~240-360 kcal (est.)"
      expect(formatted, equals('~240-360 kcal (est.)'));
    });

    test('Formats high-confidence calorie string with point value and estimate label', () {
      final formatted = CalorieEstimator.formatCalorieString(300.0, confidence: 0.90);
      expect(formatted, equals('~300 kcal (est.)'));
    });
  });
}
