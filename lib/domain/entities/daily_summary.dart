import '../../data/models/gemini_summary_response.dart';

class DailySummary {
  final DateTime date;
  final double totalCaloriesIn;
  final double totalCaloriesBurned;
  final double netVsGoal;
  final MacroSummary macroSummary;
  final int steps;
  final List<String> pros;
  final List<String> cons;
  final List<String> suggestions;
  final String overallRating;
  final DateTime generatedAt;

  const DailySummary({
    required this.date,
    required this.totalCaloriesIn,
    required this.totalCaloriesBurned,
    required this.netVsGoal,
    required this.macroSummary,
    required this.steps,
    required this.pros,
    required this.cons,
    required this.suggestions,
    required this.overallRating,
    required this.generatedAt,
  });

  factory DailySummary.fromGeminiResponse(DateTime date, GeminiSummaryResponse response) {
    return DailySummary(
      date: date,
      totalCaloriesIn: response.totalCaloriesIn,
      totalCaloriesBurned: response.totalCaloriesBurned,
      netVsGoal: response.netVsGoal,
      macroSummary: response.macroSummary,
      steps: response.steps,
      pros: response.pros,
      cons: response.cons,
      suggestions: response.suggestions,
      overallRating: response.overallRating,
      generatedAt: DateTime.now(),
    );
  }
}
