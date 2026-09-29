class UserProfile {
  final int id;
  final int age;
  final String sex; // "male" or "female"
  final double heightCm;
  final double weightKg;
  final String activityLevel; // sedentary, light, moderate, active, veryActive
  final String goal; // lose, maintain, gain
  final double targetRateKgPerWeek; // e.g. 0.5
  final double bmr;
  final double tdee;
  final int dailyCalorieTarget;
  final int proteinTargetG;
  final int carbsTargetG;
  final int fatTargetG;
  final int fiberTargetG;
  final bool onboardingComplete;
  final String deviceId;
  final DateTime updatedAt;

  const UserProfile({
    this.id = 1,
    required this.age,
    required this.sex,
    required this.heightCm,
    required this.weightKg,
    required this.activityLevel,
    required this.goal,
    required this.targetRateKgPerWeek,
    required this.bmr,
    required this.tdee,
    required this.dailyCalorieTarget,
    required this.proteinTargetG,
    required this.carbsTargetG,
    required this.fatTargetG,
    required this.fiberTargetG,
    this.onboardingComplete = false,
    required this.deviceId,
    required this.updatedAt,
  });

  UserProfile copyWith({
    int? id,
    int? age,
    String? sex,
    double? heightCm,
    double? weightKg,
    String? activityLevel,
    String? goal,
    double? targetRateKgPerWeek,
    double? bmr,
    double? tdee,
    int? dailyCalorieTarget,
    int? proteinTargetG,
    int? carbsTargetG,
    int? fatTargetG,
    int? fiberTargetG,
    bool? onboardingComplete,
    String? deviceId,
    DateTime? updatedAt,
  }) {
    return UserProfile(
      id: id ?? this.id,
      age: age ?? this.age,
      sex: sex ?? this.sex,
      heightCm: heightCm ?? this.heightCm,
      weightKg: weightKg ?? this.weightKg,
      activityLevel: activityLevel ?? this.activityLevel,
      goal: goal ?? this.goal,
      targetRateKgPerWeek: targetRateKgPerWeek ?? this.targetRateKgPerWeek,
      bmr: bmr ?? this.bmr,
      tdee: tdee ?? this.tdee,
      dailyCalorieTarget: dailyCalorieTarget ?? this.dailyCalorieTarget,
      proteinTargetG: proteinTargetG ?? this.proteinTargetG,
      carbsTargetG: carbsTargetG ?? this.carbsTargetG,
      fatTargetG: fatTargetG ?? this.fatTargetG,
      fiberTargetG: fiberTargetG ?? this.fiberTargetG,
      onboardingComplete: onboardingComplete ?? this.onboardingComplete,
      deviceId: deviceId ?? this.deviceId,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
