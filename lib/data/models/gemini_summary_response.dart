class MacroSummary {
  final double proteinG;
  final double carbsG;
  final double fatG;
  final double fiberG;

  const MacroSummary({
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.fiberG,
  });

  factory MacroSummary.fromJson(Map<String, dynamic> json) {
    double parseNum(dynamic v) {
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v) ?? 0.0;
      return 0.0;
    }

    return MacroSummary(
      proteinG: parseNum(json['protein_g'] ?? json['protein']),
      carbsG: parseNum(json['carbs_g'] ?? json['carbs']),
      fatG: parseNum(json['fat_g'] ?? json['fat']),
      fiberG: parseNum(json['fiber_g'] ?? json['fiber']),
    );
  }

  Map<String, dynamic> toJson() => {
    'protein_g': proteinG,
    'carbs_g': carbsG,
    'fat_g': fatG,
    'fiber_g': fiberG,
  };
}

class GeminiSummaryResponse {
  final double totalCaloriesIn;
  final double totalCaloriesBurned;
  final double netVsGoal;
  final MacroSummary macroSummary;
  final int steps;
  final List<String> pros;
  final List<String> cons;
  final List<String> suggestions;
  final String overallRating; // "great" | "good" | "needs_improvement"

  const GeminiSummaryResponse({
    required this.totalCaloriesIn,
    required this.totalCaloriesBurned,
    required this.netVsGoal,
    required this.macroSummary,
    required this.steps,
    required this.pros,
    required this.cons,
    required this.suggestions,
    required this.overallRating,
  });

  factory GeminiSummaryResponse.fromJson(Map<String, dynamic> json) {
    double parseNum(dynamic v) {
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v) ?? 0.0;
      return 0.0;
    }

    int parseInt(dynamic v) {
      if (v is int) return v;
      if (v is num) return v.toInt();
      if (v is String) return int.tryParse(v) ?? 0;
      return 0;
    }

    List<String> parseStringList(dynamic v) {
      if (v is List) {
        return v.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
      }
      return const [];
    }

    final macroMap = json['macro_summary'] is Map
        ? Map<String, dynamic>.from(json['macro_summary'] as Map)
        : <String, dynamic>{};

    return GeminiSummaryResponse(
      totalCaloriesIn: parseNum(json['total_calories_in']),
      totalCaloriesBurned: parseNum(json['total_calories_burned']),
      netVsGoal: parseNum(json['net_vs_goal']),
      macroSummary: MacroSummary.fromJson(macroMap),
      steps: parseInt(json['steps']),
      pros: parseStringList(json['pros']),
      cons: parseStringList(json['cons']),
      suggestions: parseStringList(json['suggestions']),
      overallRating: json['overall_rating']?.toString() ?? 'good',
    );
  }

  Map<String, dynamic> toJson() => {
    'total_calories_in': totalCaloriesIn,
    'total_calories_burned': totalCaloriesBurned,
    'net_vs_goal': netVsGoal,
    'macro_summary': macroSummary.toJson(),
    'steps': steps,
    'pros': pros,
    'cons': cons,
    'suggestions': suggestions,
    'overall_rating': overallRating,
  };
}
