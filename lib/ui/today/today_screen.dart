import 'dart:io';
import 'package:csv/csv.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/utils/calorie_estimator.dart';
import '../../domain/entities/food_entry.dart';
import '../providers.dart';
import '../shared/estimate_disclaimer.dart';
import 'widgets/activity_card.dart';
import 'widgets/date_selector.dart';
import 'widgets/food_log_grid.dart';

class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  Future<void> _exportCsv(BuildContext context, WidgetRef ref) async {
    final date = ref.read(selectedDateProvider);
    final entries = await ref.read(foodRepositoryProvider).getEntriesForDate(date);

    if (entries.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No food entries to export for this date.')),
        );
      }
      return;
    }

    final headers = [
      'Date',
      'Time',
      'Meal Type',
      'Food Name',
      'Quantity',
      'Unit',
      'Calories (kcal)',
      'Protein (g)',
      'Carbs (g)',
      'Fat (g)',
      'Fiber (g)',
      'Sugar (g)',
      'Sodium (mg)',
      'Source',
      'Confidence',
    ];

    final rows = <List<dynamic>>[headers];
    for (final e in entries) {
      rows.add([
        DateFormat('yyyy-MM-dd').format(e.date),
        e.time,
        e.mealType,
        e.foodName,
        e.quantity,
        e.quantityUnit,
        e.calories,
        e.protein,
        e.carbs,
        e.fat,
        e.fiber,
        e.sugar,
        e.sodium,
        e.source,
        e.confidence ?? '',
      ]);
    }

    final csvString = const ListToCsvConverter().convert(rows);
    final tempDir = await getTemporaryDirectory();
    final dateStr = DateFormat('yyyyMMdd').format(date);
    final file = File('${tempDir.path}/CaloriQ_Log_$dateStr.csv');
    await file.writeAsString(csvString);

    await Share.shareXFiles(
      [XFile(file.path, mimeType: 'text/csv')],
      text: 'CaloriQ Daily Food Log for ${DateFormat.yMMMd().format(date)}',
    );
  }

  Widget _buildCalorieHeaderCard(BuildContext context, WidgetRef ref) {
    final totals = ref.watch(dailyTotalsProvider);
    final profile = ref.watch(userProfileProvider).valueOrNull;
    final health = ref.watch(healthDataForSelectedDateProvider).valueOrNull;

    final target = profile?.dailyCalorieTarget ?? 2000;
    final eaten = totals.calories;
    final burned = health?.totalCaloriesBurned ?? (profile?.bmr ?? 1700.0);
    final remaining = target - eaten.round();

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F766E), Color(0xFF14B8A6)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F766E).withOpacity(0.2),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'CALORIE BUDGET',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        remaining >= 0 ? '$remaining' : '+${remaining.abs()}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        remaining >= 0 ? 'kcal remaining' : 'kcal over target',
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                      ),
                    ],
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  'Goal: $target kcal',
                  style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _metricColumn('Intake (Est.)', '~${eaten.round()} kcal', '🍽️'),
                Container(width: 1, height: 24, color: Colors.white24),
                _metricColumn('Burned (Est.)', '~${burned.round()} kcal', '🔥'),
                Container(width: 1, height: 24, color: Colors.white24),
                _metricColumn('Net Deficit/Surplus', '${(eaten - burned).round()} kcal', '⚖️'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _metricColumn(String label, String value, String icon) {
    return Column(
      children: [
        Text(
          '$icon $value',
          style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(color: Colors.white70, fontSize: 10),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('CaloriQ'),
        actions: [
          IconButton(
            icon: const Icon(Icons.download_rounded),
            tooltip: 'Export CSV',
            onPressed: () => _exportCsv(context, ref),
          ),
        ],
      ),
      body: Column(
        children: [
          const DateSelector(),
          const EstimateDisclaimerBanner(),
          _buildCalorieHeaderCard(context, ref),
          const ActivityCard(),
          const Expanded(
            child: FoodLogGrid(),
          ),
        ],
      ),
    );
  }
}
