class FoodEntry {
  final int id;
  final DateTime date; // Normalized to midnight
  final String time; // e.g. "08:30 AM"
  final String mealType; // breakfast, lunch, dinner, snack
  final String foodName;
  final double quantity;
  final String quantityUnit; // "g", "serving", "oz", etc.
  final double calories;
  final double protein;
  final double carbs;
  final double fat;
  final double fiber;
  final double sugar;
  final double sodium; // mg
  final String source; // "ai" or "manual"
  final double? confidence; // 0.0 to 1.0 (null for manual)
  final DateTime createdAt;

  const FoodEntry({
    required this.id,
    required this.date,
    required this.time,
    required this.mealType,
    required this.foodName,
    required this.quantity,
    this.quantityUnit = 'g',
    required this.calories,
    this.protein = 0.0,
    this.carbs = 0.0,
    this.fat = 0.0,
    this.fiber = 0.0,
    this.sugar = 0.0,
    this.sodium = 0.0,
    this.source = 'manual',
    this.confidence,
    required this.createdAt,
  });

  bool get isAi => source == 'ai';

  FoodEntry copyWith({
    int? id,
    DateTime? date,
    String? time,
    String? mealType,
    String? foodName,
    double? quantity,
    String? quantityUnit,
    double? calories,
    double? protein,
    double? carbs,
    double? fat,
    double? fiber,
    double? sugar,
    double? sodium,
    String? source,
    double? confidence,
    DateTime? createdAt,
  }) {
    return FoodEntry(
      id: id ?? this.id,
      date: date ?? this.date,
      time: time ?? this.time,
      mealType: mealType ?? this.mealType,
      foodName: foodName ?? this.foodName,
      quantity: quantity ?? this.quantity,
      quantityUnit: quantityUnit ?? this.quantityUnit,
      calories: calories ?? this.calories,
      protein: protein ?? this.protein,
      carbs: carbs ?? this.carbs,
      fat: fat ?? this.fat,
      fiber: fiber ?? this.fiber,
      sugar: sugar ?? this.sugar,
      sodium: sodium ?? this.sodium,
      source: source ?? this.source,
      confidence: confidence ?? this.confidence,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
