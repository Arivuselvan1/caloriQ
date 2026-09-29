class HealthData {
  final DateTime date;
  final int steps;
  final double activeCaloriesBurned;
  final double basalCaloriesBurned;
  final double totalCaloriesBurned;
  final bool isEstimated; // True if fallback formula (BMR + steps) was used
  final DateTime? lastSyncedAt;

  const HealthData({
    required this.date,
    required this.steps,
    required this.activeCaloriesBurned,
    required this.basalCaloriesBurned,
    required this.totalCaloriesBurned,
    this.isEstimated = false,
    this.lastSyncedAt,
  });

  HealthData copyWith({
    DateTime? date,
    int? steps,
    double? activeCaloriesBurned,
    double? basalCaloriesBurned,
    double? totalCaloriesBurned,
    bool? isEstimated,
    DateTime? lastSyncedAt,
  }) {
    return HealthData(
      date: date ?? this.date,
      steps: steps ?? this.steps,
      activeCaloriesBurned: activeCaloriesBurned ?? this.activeCaloriesBurned,
      basalCaloriesBurned: basalCaloriesBurned ?? this.basalCaloriesBurned,
      totalCaloriesBurned: totalCaloriesBurned ?? this.totalCaloriesBurned,
      isEstimated: isEstimated ?? this.isEstimated,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
    );
  }
}
