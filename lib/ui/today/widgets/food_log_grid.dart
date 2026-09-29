import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants.dart';
import '../../../domain/entities/food_entry.dart';
import '../../providers.dart';
import 'daily_totals_row.dart';
import 'food_entry_row.dart';

class FoodLogGrid extends ConsumerStatefulWidget {
  const FoodLogGrid({super.key});

  @override
  ConsumerState<FoodLogGrid> createState() => _FoodLogGridState();
}

class _FoodLogGridState extends ConsumerState<FoodLogGrid> {
  late ScrollController _headerScrollController;
  late ScrollController _bodyScrollController;
  late ScrollController _totalsScrollController;
  bool _isSyncingScroll = false;

  @override
  void initState() {
    super.initState();
    _headerScrollController = ScrollController();
    _bodyScrollController = ScrollController();
    _totalsScrollController = ScrollController();

    _bodyScrollController.addListener(() {
      if (_isSyncingScroll) return;
      _isSyncingScroll = true;
      if (_headerScrollController.hasClients) {
        _headerScrollController.jumpTo(_bodyScrollController.offset);
      }
      if (_totalsScrollController.hasClients) {
        _totalsScrollController.jumpTo(_bodyScrollController.offset);
      }
      _isSyncingScroll = false;
    });

    _headerScrollController.addListener(() {
      if (_isSyncingScroll) return;
      _isSyncingScroll = true;
      if (_bodyScrollController.hasClients) {
        _bodyScrollController.jumpTo(_headerScrollController.offset);
      }
      if (_totalsScrollController.hasClients) {
        _totalsScrollController.jumpTo(_headerScrollController.offset);
      }
      _isSyncingScroll = false;
    });
  }

  @override
  void dispose() {
    _headerScrollController.dispose();
    _bodyScrollController.dispose();
    _totalsScrollController.dispose();
    super.dispose();
  }

  Future<void> _addNewEntry() async {
    final now = DateTime.now();
    final selectedDate = ref.read(selectedDateProvider);
    final timeStr = DateFormat('hh:mm a').format(now);

    final newEntry = FoodEntry(
      id: 0,
      date: selectedDate,
      time: timeStr,
      mealType: MealType.lunch.name,
      foodName: 'New Item',
      quantity: 100,
      quantityUnit: 'g',
      calories: 100,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      source: 'manual',
      createdAt: now,
    );

    await ref.read(foodRepositoryProvider).addEntry(newEntry);
  }

  Widget _buildHeader() {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFFF1F5F9),
        border: Border(
          top: BorderSide(color: Color(0xFFE2E8F0)),
          bottom: BorderSide(color: Color(0xFFCBD5E1), width: 1.5),
        ),
      ),
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: SingleChildScrollView(
        controller: _headerScrollController,
        scrollDirection: Axis.horizontal,
        physics: const ClampingScrollPhysics(),
        child: const Row(
          children: [
            SizedBox(
              width: 80,
              child: Center(
                child: Text('Time', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 80,
              child: Center(
                child: Text('Meal', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 140,
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: Text('Food Name', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 80,
              child: Center(
                child: Text('Qty', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 75,
              child: Center(
                child: Text('Calories', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 65,
              child: Center(
                child: Text('Protein', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 65,
              child: Center(
                child: Text('Carbs', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 65,
              child: Center(
                child: Text('Fat', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 65,
              child: Center(
                child: Text('Fiber', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 65,
              child: Center(
                child: Text('Sugar', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 75,
              child: Center(
                child: Text('Sodium', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 70,
              child: Center(
                child: Text('Source', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            SizedBox(
              width: 50,
              child: Center(
                child: Text('Edit', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final entriesAsync = ref.watch(foodEntriesForSelectedDateProvider);
    final totals = ref.watch(dailyTotalsProvider);

    return Column(
      children: [
        _buildHeader(),
        Expanded(
          child: entriesAsync.when(
            data: (entries) {
              if (entries.isEmpty) {
                return Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.table_restaurant_outlined, size: 40, color: Colors.grey.shade400),
                      const SizedBox(height: 8),
                      const Text(
                        'No food items logged for this date',
                        style: TextStyle(fontWeight: FontWeight.w600, color: Colors.grey),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: _addNewEntry,
                        icon: const Icon(Icons.add, size: 16),
                        label: const Text('Add Food Row'),
                      ),
                    ],
                  ),
                );
              }

              return SingleChildScrollView(
                controller: _bodyScrollController,
                scrollDirection: Axis.horizontal,
                physics: const ClampingScrollPhysics(),
                child: SizedBox(
                  width: 935, // Sum of column widths
                  child: ListView.builder(
                    itemCount: entries.length + 1, // +1 for "Add New Row" button
                    itemBuilder: (context, index) {
                      if (index == entries.length) {
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton.icon(
                              onPressed: _addNewEntry,
                              icon: const Icon(Icons.add_circle_outline, size: 18),
                              label: const Text('Add Entry Row'),
                            ),
                          ),
                        );
                      }

                      final entry = entries[index];
                      return FoodEntryRow(
                        key: ValueKey('entry_${entry.id}'),
                        entry: entry,
                        isEven: index.isEven,
                        onDelete: () async {
                          await ref.read(foodRepositoryProvider).deleteEntry(entry.id);
                        },
                      );
                    },
                  ),
                ),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error loading log: $e')),
          ),
        ),

        // Pinned daily totals row sticky at the bottom
        DailyTotalsRow(
          totals: totals,
          scrollController: _totalsScrollController,
        ),
      ],
    );
  }
}
