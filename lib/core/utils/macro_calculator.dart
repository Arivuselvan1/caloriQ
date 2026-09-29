import '../constants.dart';

class MacroTargets {
  final int proteinG;
  final int carbsG;
  final int fatG;
  final int fiberG;

  const MacroTargets({
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.fiberG,
  });

  int get proteinCalories => proteinG * 4;
  int get carbsCalories => carbsG * 4;
  int get fatCalories => fatG * 9;
  int get totalCalories => proteinCalories + carbsCalories + fatCalories;
}

/// Calculates macronutrient targets based on total calories, body weight, and fitness goal.
class MacroCalculator {
  static MacroTargets calculateMacros({
    required int dailyCalories,
    required double weightKg,
    required String goal,
  }) {
    final goalType = GoalType.fromString(goal);

    // Protein scaling based on evidence-backed targets:
    // - Weight Loss: 1.8g/kg to preserve lean muscle in deficit
    // - Weight Gain: 2.0g/kg to support hypertrophy
    // - Maintain: 1.4g/kg
    final double proteinGramsPerKg = switch (goalType) {
      GoalType.lose => 1.8,
      GoalType.gain => 2.0,
      GoalType.maintain => 1.4,
    };

    final int proteinG = (weightKg * proteinGramsPerKg).round().clamp(50, 300);
    final int proteinKcal = proteinG * 4;

    // Dietary fat target: 25% to 30% of total daily energy
    final int fatKcal = (dailyCalories * 0.28).round();
    final int fatG = (fatKcal / 9).round().clamp(30, 200);

    // Carbohydrates: Remaining calories allocated to carbs
    final int remainingKcal = dailyCalories - proteinKcal - (fatG * 9);
    final int carbsG = (remainingKcal > 0 ? (remainingKcal / 4).round() : 50).clamp(30, 600);

    // Fiber guideline: ~14g per 1,000 kcal
    final int fiberG = ((dailyCalories / 1000.0) * 14.0).round().clamp(20, 50);

    return MacroTargets(
      proteinG: proteinG,
      carbsG: carbsG,
      fatG: fatG,
      fiberG: fiberG,
    );
  }
}
