import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants.dart';
import '../../../domain/entities/food_entry.dart';
import '../../providers.dart';

class FoodEntryRow extends ConsumerStatefulWidget {
  final FoodEntry entry;
  final bool isEven;
  final VoidCallback onDelete;

  const FoodEntryRow({
    super.key,
    required this.entry,
    required this.isEven,
    required this.onDelete,
  });

  @override
  ConsumerState<FoodEntryRow> createState() => _FoodEntryRowState();
}

class _FoodEntryRowState extends ConsumerState<FoodEntryRow> {
  late TextEditingController _editingController;
  final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _editingController = TextEditingController();
  }

  @override
  void dispose() {
    _editingController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _startEditing(String field, String initialValue) {
    _editingController.text = initialValue;
    ref.read(activeCellProvider.notifier).state = ActiveCellCoordinate(widget.entry.id, field);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  Future<void> _commitEdit(String field) async {
    final active = ref.read(activeCellProvider);
    if (active == null || active.entryId != widget.entry.id || active.field != field) return;

    final newVal = _editingController.text.trim();
    ref.read(activeCellProvider.notifier).state = null;

    final repo = ref.read(foodRepositoryProvider);
    FoodEntry updated = widget.entry;

    double parseNum(String s, double fallback) => double.tryParse(s) ?? fallback;

    switch (field) {
      case 'foodName':
        if (newVal.isNotEmpty) updated = widget.entry.copyWith(foodName: newVal);
        break;
      case 'quantity':
        updated = widget.entry.copyWith(quantity: parseNum(newVal, widget.entry.quantity));
        break;
      case 'calories':
        updated = widget.entry.copyWith(calories: parseNum(newVal, widget.entry.calories));
        break;
      case 'protein':
        updated = widget.entry.copyWith(protein: parseNum(newVal, widget.entry.protein));
        break;
      case 'carbs':
        updated = widget.entry.copyWith(carbs: parseNum(newVal, widget.entry.carbs));
        break;
      case 'fat':
        updated = widget.entry.copyWith(fat: parseNum(newVal, widget.entry.fat));
        break;
      case 'fiber':
        updated = widget.entry.copyWith(fiber: parseNum(newVal, widget.entry.fiber));
        break;
      case 'sugar':
        updated = widget.entry.copyWith(sugar: parseNum(newVal, widget.entry.sugar));
        break;
      case 'sodium':
        updated = widget.entry.copyWith(sodium: parseNum(newVal, widget.entry.sodium));
        break;
    }

    if (updated != widget.entry) {
      await repo.updateEntry(updated);
    }
  }

  Widget _buildEditableCell({
    required double width,
    required String field,
    required String displayValue,
    TextInputType keyboardType = TextInputType.text,
    TextAlign align = TextAlign.center,
  }) {
    final active = ref.watch(activeCellProvider);
    final isEditing = active?.entryId == widget.entry.id && active?.field == field;

    if (isEditing) {
      return Container(
        width: width,
        height: 38,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: TextField(
          controller: _editingController,
          focusNode: _focusNode,
          keyboardType: keyboardType,
          textAlign: align,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
          decoration: InputDecoration(
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(4)),
          ),
          onSubmitted: (_) => _commitEdit(field),
          onTapOutside: (_) => _commitEdit(field),
        ),
      );
    }

    return InkWell(
      onTap: () => _startEditing(field, displayValue),
      child: Container(
        width: width,
        height: 38,
        alignment: align == TextAlign.left ? Alignment.centerLeft : Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Text(
          displayValue,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final entry = widget.entry;
    final rowBg = widget.isEven ? Colors.white : const Color(0xFFF8FAFC);

    return Container(
      color: rowBg,
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFFF1F5F9), width: 1)),
      ),
      child: Row(
        children: [
          // Time
          SizedBox(
            width: 80,
            child: Center(
              child: Text(
                entry.time,
                style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
              ),
            ),
          ),

          // Meal Type (Clickable to switch)
          SizedBox(
            width: 80,
            child: PopupMenuButton<MealType>(
              initialValue: MealType.fromString(entry.mealType),
              onSelected: (type) {
                ref.read(foodRepositoryProvider).updateEntry(
                      entry.copyWith(mealType: type.name),
                    );
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(MealType.fromString(entry.mealType).emoji, style: const TextStyle(fontSize: 12)),
                    const SizedBox(width: 4),
                    Text(
                      MealType.fromString(entry.mealType).label,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              itemBuilder: (context) => MealType.values
                  .map(
                    (m) => PopupMenuItem(
                      value: m,
                      child: Text('${m.emoji} ${m.label}'),
                    ),
                  )
                  .toList(),
            ),
          ),

          // Food Name
          _buildEditableCell(
            width: 140,
            field: 'foodName',
            displayValue: entry.foodName,
            align: TextAlign.left,
          ),

          // Quantity
          _buildEditableCell(
            width: 80,
            field: 'quantity',
            displayValue: '${entry.quantity.toStringAsFixed(0)} ${entry.quantityUnit}',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),

          // Calories
          _buildEditableCell(
            width: 75,
            field: 'calories',
            displayValue: '${entry.calories.round()}',
            keyboardType: TextInputType.number,
          ),

          // Protein
          _buildEditableCell(
            width: 65,
            field: 'protein',
            displayValue: '${entry.protein.round()}g',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),

          // Carbs
          _buildEditableCell(
            width: 65,
            field: 'carbs',
            displayValue: '${entry.carbs.round()}g',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),

          // Fat
          _buildEditableCell(
            width: 65,
            field: 'fat',
            displayValue: '${entry.fat.round()}g',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),

          // Fiber
          _buildEditableCell(
            width: 65,
            field: 'fiber',
            displayValue: '${entry.fiber.round()}g',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),

          // Sugar
          _buildEditableCell(
            width: 65,
            field: 'sugar',
            displayValue: '${entry.sugar.round()}g',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),

          // Sodium
          _buildEditableCell(
            width: 75,
            field: 'sodium',
            displayValue: '${entry.sodium.round()}mg',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),

          // Source (AI vs Manual)
          SizedBox(
            width: 70,
            child: Center(
              child: entry.isAi
                  ? Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.purple.shade50,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: Colors.purple.shade200),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.auto_awesome, size: 10, color: Colors.purple),
                          const SizedBox(width: 2),
                          Text(
                            entry.confidence != null
                                ? '${(entry.confidence! * 100).round()}%'
                                : 'AI',
                            style: const TextStyle(fontSize: 10, color: Colors.purple, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    )
                  : Text(
                      'Manual',
                      style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
                    ),
            ),
          ),

          // Delete Action
          SizedBox(
            width: 50,
            child: IconButton(
              icon: Icon(Icons.delete_outline, size: 18, color: Colors.red.shade400),
              onPressed: widget.onDelete,
            ),
          ),
        ],
      ),
    );
  }
}
