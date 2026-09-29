class GeminiFoodItem {
  final String name;
  final double estimatedGrams;
  final double calories;
  final double protein;
  final double carbs;
  final double fat;
  final double fiber;
  final double sugar;
  final double sodium;
  final double confidence; // 0.0 to 1.0

  const GeminiFoodItem({
    required this.name,
    required this.estimatedGrams,
    required this.calories,
    required this.protein,
    required this.carbs,
    required this.fat,
    required this.fiber,
    required this.sugar,
    required this.sodium,
    required this.confidence,
  });

  /// Recalculates all macros proportionally when user modifies the portion size in grams
  GeminiFoodItem recalculateForPortion(double newGrams) {
    if (estimatedGrams <= 0 || newGrams <= 0) {
      return copyWith(estimatedGrams: newGrams);
    }
    final ratio = newGrams / estimatedGrams;
    return GeminiFoodItem(
      name: name,
      estimatedGrams: (newGrams * 10).round() / 10,
      calories: ((calories * ratio) * 10).round() / 10,
      protein: ((protein * ratio) * 10).round() / 10,
      carbs: ((carbs * ratio) * 10).round() / 10,
      fat: ((fat * ratio) * 10).round() / 10,
      fiber: ((fiber * ratio) * 10).round() / 10,
      sugar: ((sugar * ratio) * 10).round() / 10,
      sodium: ((sodium * ratio) * 10).round() / 10,
      confidence: confidence,
    );
  }

  GeminiFoodItem copyWith({
    String? name,
    double? estimatedGrams,
    double? calories,
    double? protein,
    double? carbs,
    double? fat,
    double? fiber,
    double? sugar,
    double? sodium,
    double? confidence,
  }) {
    return GeminiFoodItem(
      name: name ?? this.name,
      estimatedGrams: estimatedGrams ?? this.estimatedGrams,
      calories: calories ?? this.calories,
      protein: protein ?? this.protein,
      carbs: carbs ?? this.carbs,
      fat: fat ?? this.fat,
      fiber: fiber ?? this.fiber,
      sugar: sugar ?? this.sugar,
      sodium: sodium ?? this.sodium,
      confidence: confidence ?? this.confidence,
    );
  }

  factory GeminiFoodItem.fromJson(Map<String, dynamic> json) {
    double parseNum(dynamic val, [double fallback = 0.0]) {
      if (val is num) return val.toDouble();
      if (val is String) return double.tryParse(val) ?? fallback;
      return fallback;
    }

    final rawName = json['name'] as String?;
    if (rawName == null || rawName.trim().isEmpty) {
      throw const FormatException('Item name is required and cannot be empty');
    }

    final grams = parseNum(json['estimated_grams'] ?? json['estimatedGrams'], 100.0);
    final cals = parseNum(json['calories'], 0.0);
    final p = parseNum(json['protein'], 0.0);
    final c = parseNum(json['carbs'], 0.0);
    final f = parseNum(json['fat'], 0.0);
    final fiber = parseNum(json['fiber'], 0.0);
    final sugar = parseNum(json['sugar'], 0.0);
    final sodium = parseNum(json['sodium'], 0.0);
    final conf = parseNum(json['confidence'], 0.8).clamp(0.0, 1.0);

    return GeminiFoodItem(
      name: rawName.trim(),
      estimatedGrams: grams,
      calories: cals,
      protein: p,
      carbs: c,
      fat: f,
      fiber: fiber,
      sugar: sugar,
      sodium: sodium,
      confidence: conf,
    );
  }

  Map<String, dynamic> toJson() => {
    'name': name,
    'estimated_grams': estimatedGrams,
    'calories': calories,
    'protein': protein,
    'carbs': carbs,
    'fat': fat,
    'fiber': fiber,
    'sugar': sugar,
    'sodium': sodium,
    'confidence': confidence,
  };
}

class GeminiFoodResponse {
  final List<GeminiFoodItem> items;
  final String? error;
  final String? message;

  const GeminiFoodResponse({
    required this.items,
    this.error,
    this.message,
  });

  bool get isNoFoodDetected => error == 'no_food_detected';
  bool get hasError => error != null && error!.isNotEmpty;

  factory GeminiFoodResponse.fromJson(Map<String, dynamic> json) {
    if (json.containsKey('error') && json['error'] != null) {
      return GeminiFoodResponse(
        items: const [],
        error: json['error'].toString(),
        message: json['message']?.toString() ?? 'No food detected in photo',
      );
    }

    final rawItems = json['items'];
    if (rawItems is! List) {
      throw const FormatException("Invalid JSON: 'items' array missing or not a list");
    }

    final items = <GeminiFoodItem>[];
    for (final item in rawItems) {
      if (item is Map<String, dynamic>) {
        items.add(GeminiFoodItem.fromJson(item));
      } else if (item is Map) {
        items.add(GeminiFoodItem.fromJson(Map<String, dynamic>.from(item)));
      }
    }

    return GeminiFoodResponse(items: items);
  }
}
