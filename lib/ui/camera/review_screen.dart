import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/constants.dart';
import '../../core/utils/calorie_estimator.dart';
import '../../data/models/gemini_food_response.dart';
import '../../domain/entities/food_entry.dart';
import '../providers.dart';

class ReviewScreen extends ConsumerStatefulWidget {
  final List<GeminiFoodItem> initialItems;

  const ReviewScreen({super.key, required this.initialItems});

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends ConsumerState<ReviewScreen> {
  late List<GeminiFoodItem> _items;
  MealType _selectedMeal = MealType.lunch;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _items = List.from(widget.initialItems);
    final hour = DateTime.now().hour;
    if (hour < 11) {
      _selectedMeal = MealType.breakfast;
    } else if (hour < 16) {
      _selectedMeal = MealType.lunch;
    } else {
      _selectedMeal = MealType.dinner;
    }
  }

  void _updatePortion(int index, double newGrams) {
    setState(() {
      _items[index] = _items[index].recalculateForPortion(newGrams);
    });
  }

  void _updateName(int index, String newName) {
    setState(() {
      _items[index] = _items[index].copyWith(name: newName);
    });
  }

  void _removeItem(int index) {
    setState(() {
      _items.removeAt(index);
    });
    if (_items.isEmpty) {
      Navigator.pop(context);
    }
  }

  Future<void> _saveApprovedItems() async {
    if (_items.isEmpty) return;
    setState(() => _saving = true);

    final now = DateTime.now();
    final selectedDate = ref.read(selectedDateProvider);
    final timeStr = DateFormat('hh:mm a').format(now);
    final repo = ref.read(foodRepositoryProvider);

    final entriesToSave = _items.map((item) {
      return FoodEntry(
        id: 0,
        date: selectedDate,
        time: timeStr,
        mealType: _selectedMeal.name,
        foodName: item.name,
        quantity: item.estimatedGrams,
        quantityUnit: 'g',
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: item.fiber,
        sugar: item.sugar,
        sodium: item.sodium,
        source: 'ai',
        confidence: item.confidence,
        createdAt: now,
      );
    }).toList();

    await repo.addMultipleEntries(entriesToSave);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Added ${_items.length} items to ${_selectedMeal.label} log!'),
          backgroundColor: const Color(0xFF0F766E),
        ),
      );
      Navigator.pop(context); // Exit review
    }
  }

  Widget _buildItemCard(int index, GeminiFoodItem item) {
    final calorieDisplay = CalorieEstimator.formatCalorieString(
      item.calories,
      confidence: item.confidence,
    );
    final isLowConfidence = item.confidence < AppConstants.lowConfidenceThreshold;

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: isLowConfidence ? Colors.amber.shade300 : const Color(0xFFE2E8F0),
          width: isLowConfidence ? 1.5 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: Name & delete
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: item.name,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    decoration: const InputDecoration(
                      isDense: true,
                      contentPadding: EdgeInsets.zero,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                    ),
                    onChanged: (val) => _updateName(index, val),
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.close_rounded, size: 20, color: Colors.grey.shade500),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () => _removeItem(index),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Grams editing row
            Row(
              children: [
                const Text('Portion Size: ', style: TextStyle(fontSize: 13, color: Colors.grey)),
                SizedBox(
                  width: 75,
                  child: TextFormField(
                    initialValue: item.estimatedGrams.toStringAsFixed(0),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                    decoration: InputDecoration(
                      isDense: true,
                      suffixText: 'g',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                    onChanged: (val) {
                      final parsed = double.tryParse(val);
                      if (parsed != null && parsed > 0) {
                        _updatePortion(index, parsed);
                      }
                    },
                  ),
                ),
                const Spacer(),
                Text(
                  calorieDisplay,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: isLowConfidence ? Colors.amber.shade900 : const Color(0xFF0F766E),
                  ),
                ),
              ],
            ),

            if (isLowConfidence) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(Icons.warning_amber_rounded, size: 14, color: Colors.amber.shade800),
                  const SizedBox(width: 4),
                  Text(
                    'Low certainty (${(item.confidence * 100).round()}%). Calorie range displayed.',
                    style: TextStyle(fontSize: 11, color: Colors.amber.shade900),
                  ),
                ],
              ),
            ],

            const Divider(height: 20),

            // Macros row
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _macroMini('Protein', '${item.protein.toStringAsFixed(1)}g'),
                _macroMini('Carbs', '${item.carbs.toStringAsFixed(1)}g'),
                _macroMini('Fat', '${item.fat.toStringAsFixed(1)}g'),
                _macroMini('Fiber', '${item.fiber.toStringAsFixed(1)}g'),
                _macroMini('Sodium', '${item.sodium.round()}mg'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _macroMini(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
        Text(label, style: TextStyle(fontSize: 10, color: Colors.grey.shade600)),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final totalCalories = _items.fold(0.0, (acc, item) => acc + item.calories);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Review Food Items'),
      ),
      body: Column(
        children: [
          // Estimate notice
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: const Color(0xFFFEF3C7),
            child: Row(
              children: [
                const Icon(Icons.info_outline, size: 18, color: Color(0xFFD97706)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Values are AI estimates. Tap portion grams or food name to adjust; macros recalculate automatically.',
                    style: TextStyle(fontSize: 12, color: Colors.brown.shade800),
                  ),
                ),
              ],
            ),
          ),

          // Meal selection bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                const Text('Assign to: ', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(width: 8),
                Expanded(
                  child: SegmentedButton<MealType>(
                    segments: MealType.values.map((m) {
                      return ButtonSegment(
                        value: m,
                        label: Text(m.label, style: const TextStyle(fontSize: 11)),
                      );
                    }).toList(),
                    selected: {_selectedMeal},
                    onSelectionChanged: (set) => setState(() => _selectedMeal = set.first),
                  ),
                ),
              ],
            ),
          ),

          // List of items
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _items.length,
              itemBuilder: (ctx, idx) => _buildItemCard(idx, _items[idx]),
            ),
          ),

          // Bottom Bar
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Color(0xFFE2E8F0))),
            ),
            child: Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Total Estimate', style: TextStyle(fontSize: 11, color: Colors.grey)),
                    Text(
                      '~${totalCalories.round()} kcal',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF0F766E)),
                    ),
                  ],
                ),
                const SizedBox(width: 20),
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: _saving ? null : _saveApprovedItems,
                      icon: _saving
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Icon(Icons.check_rounded),
                      label: Text(_saving ? 'Writing to Log...' : 'Add ${_items.length} to Log'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
