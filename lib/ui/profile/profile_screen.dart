import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../domain/entities/weight_entry.dart';
import '../providers.dart';
import '../shared/medical_disclaimer.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  void _showLogWeightDialog(BuildContext context, WidgetRef ref, double currentWeight) {
    final controller = TextEditingController(text: currentWeight.toStringAsFixed(1));
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log Today\'s Weight'),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(
            labelText: 'Weight (kg)',
            suffixText: 'kg',
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              final val = double.tryParse(controller.text);
              if (val != null && val > 20 && val < 300) {
                await ref.read(userRepositoryProvider).logWeight(val);
                if (ctx.mounted) Navigator.pop(ctx);
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  Widget _buildWeightTrendChart(List<WeightEntry> weightLogs) {
    if (weightLogs.length < 2) {
      return Container(
        height: 160,
        alignment: Alignment.center,
        child: const Text(
          'Log your weight on multiple days to view your trend chart.',
          style: TextStyle(color: Colors.grey, fontSize: 13),
          textAlign: TextAlign.center,
        ),
      );
    }

    final spots = <FlSpot>[];
    for (int i = 0; i < weightLogs.length; i++) {
      spots.add(FlSpot(i.toDouble(), weightLogs[i].weightKg));
    }

    final minW = weightLogs.map((e) => e.weightKg).reduce((a, b) => a < b ? a : b) - 1.0;
    final maxW = weightLogs.map((e) => e.weightKg).reduce((a, b) => a > b ? a : b) + 1.0;

    return Container(
      height: 200,
      padding: const EdgeInsets.only(top: 16, right: 16, left: 8, bottom: 8),
      child: LineChart(
        LineChartData(
          minY: minW,
          maxY: maxW,
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            getDrawingHorizontalLine: (value) => FlLine(
              color: Colors.grey.shade200,
              strokeWidth: 1,
            ),
          ),
          titlesData: FlTitlesData(
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 42,
                getTitlesWidget: (val, _) => Text(
                  '${val.toStringAsFixed(1)}k',
                  style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
                ),
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                getTitlesWidget: (idx, _) {
                  final i = idx.toInt();
                  if (i >= 0 && i < weightLogs.length && (i == 0 || i == weightLogs.length - 1 || i % 3 == 0)) {
                    return Text(
                      DateFormat('MM/dd').format(weightLogs[i].date),
                      style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
                    );
                  }
                  return const SizedBox.shrink();
                },
              ),
            ),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          ),
          borderData: FlBorderData(show: false),
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: true,
              color: const Color(0xFF0F766E),
              barWidth: 3,
              isStrokeCapRound: true,
              dotData: FlDotData(
                show: true,
                getDotPainter: (spot, percent, barData, index) => FlDotCirclePainter(
                  radius: 4,
                  color: Colors.white,
                  strokeWidth: 2.5,
                  strokeColor: const Color(0xFF0F766E),
                ),
              ),
              belowBarData: BarAreaData(
                show: true,
                color: const Color(0xFF0F766E).withOpacity(0.12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(userProfileProvider);
    final weightLogsAsync = ref.watch(weightLogsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile & Targets'),
      ),
      body: profileAsync.when(
        data: (profile) {
          if (profile == null) {
            return const Center(child: Text('No profile found.'));
          }

          final weightLogs = weightLogsAsync.valueOrNull ?? [];

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Header Card
                Container(
                  margin: const EdgeInsets.all(16),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${profile.goal.toUpperCase()} WEIGHT',
                                style: const TextStyle(
                                  color: Color(0xFF0F766E),
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '${profile.dailyCalorieTarget} kcal / day',
                                style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900),
                              ),
                            ],
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0F766E).withOpacity(0.1),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              '${profile.targetRateKgPerWeek} kg/wk',
                              style: const TextStyle(
                                color: Color(0xFF0F766E),
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 28),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _statItem('BMR', '~${profile.bmr.round()}'),
                          _statItem('TDEE', '~${profile.tdee.round()}'),
                          _statItem('Protein', '${profile.proteinTargetG}g'),
                          _statItem('Carbs', '${profile.carbsTargetG}g'),
                          _statItem('Fat', '${profile.fatTargetG}g'),
                        ],
                      ),
                    ],
                  ),
                ),

                // Weight Progress Card with FL Chart
                Card(
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Weight Trend',
                                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                                ),
                                Text(
                                  'Current: ${profile.weightKg.toStringAsFixed(1)} kg',
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                                ),
                              ],
                            ),
                            FilledButton.icon(
                              onPressed: () => _showLogWeightDialog(context, ref, profile.weightKg),
                              icon: const Icon(Icons.add, size: 16),
                              label: const Text('Log Weight'),
                              style: FilledButton.styleFrom(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                textStyle: const TextStyle(fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        _buildWeightTrendChart(weightLogs),
                      ],
                    ),
                  ),
                ),

                // Biometrics Summary
                Card(
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Biometrics & Profile', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        const SizedBox(height: 12),
                        _bioRow('Age', '${profile.age} years old'),
                        _bioRow('Sex', profile.sex.toUpperCase()),
                        _bioRow('Height', '${profile.heightCm.round()} cm'),
                        _bioRow('Activity Level', profile.activityLevel.toUpperCase()),
                      ],
                    ),
                  ),
                ),

                const MedicalDisclaimerNote(),
                const SizedBox(height: 20),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error loading profile: $e')),
      ),
    );
  }

  Widget _statItem(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
      ],
    );
  }

  Widget _bioRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        ],
      ),
    );
  }
}
