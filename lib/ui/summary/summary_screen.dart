import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../domain/entities/daily_summary.dart';
import '../../domain/entities/health_data.dart';
import '../providers.dart';
import '../shared/medical_disclaimer.dart';

class SummaryScreen extends ConsumerStatefulWidget {
  const SummaryScreen({super.key});

  @override
  ConsumerState<SummaryScreen> createState() => _SummaryScreenState();
}

class _SummaryScreenState extends ConsumerState<SummaryScreen> {
  bool _loading = false;
  DailySummary? _summary;
  String? _error;

  Future<void> _generateSummary() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final date = ref.read(selectedDateProvider);
      final entries = await ref.read(foodRepositoryProvider).getEntriesForDate(date);
      final health = await ref.read(healthRepositoryProvider).getHealthForDate(date) ??
          HealthData(
            date: date,
            steps: 0,
            activeCaloriesBurned: 0,
            basalCaloriesBurned: 0,
            totalCaloriesBurned: 0,
          );
      final profile = await ref.read(userRepositoryProvider).getProfile();

      if (profile == null) {
        throw Exception('Profile not found. Please complete setup first.');
      }

      final deviceId = await ref.read(userRepositoryProvider).getOrCreateDeviceId();
      final aiRepo = ref.read(aiRepositoryProvider);

      final result = await aiRepo.generateDailySummary(
        date: date,
        foodLog: entries,
        healthData: health,
        profile: profile,
        deviceId: deviceId,
      );

      setState(() {
        _summary = result;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Widget _buildRatingBadge(String rating) {
    Color bg;
    Color fg;
    String text;
    IconData icon;

    switch (rating.toLowerCase()) {
      case 'great':
        bg = Colors.green.shade50;
        fg = Colors.green.shade800;
        text = 'Great Day!';
        icon = Icons.emoji_events_rounded;
        break;
      case 'needs_improvement':
        bg = Colors.orange.shade50;
        fg = Colors.orange.shade900;
        text = 'Needs Attention';
        icon = Icons.bolt_rounded;
        break;
      default:
        bg = Colors.teal.shade50;
        fg = Colors.teal.shade800;
        text = 'Good Progress';
        icon = Icons.thumb_up_alt_rounded;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: fg.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: fg),
          const SizedBox(width: 6),
          Text(
            text,
            style: TextStyle(color: fg, fontWeight: FontWeight.bold, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildListCard({
    required String title,
    required IconData icon,
    required Color iconColor,
    required List<String> items,
  }) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 20, color: iconColor),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...items.map((item) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        margin: const EdgeInsets.only(top: 6, right: 8),
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: iconColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      Expanded(
                        child: Text(
                          item,
                          style: const TextStyle(fontSize: 13, height: 1.4),
                        ),
                      ),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final selectedDate = ref.watch(selectedDateProvider);
    final dateStr = DateFormat('EEEE, MMM d').format(selectedDate);

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Daily Summary'),
        actions: [
          if (_summary != null)
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              tooltip: 'Regenerate',
              onPressed: _loading ? null : _generateSummary,
            ),
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Top Date Header
            Container(
              padding: const EdgeInsets.all(16),
              color: Colors.white,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'COACH INSIGHTS',
                        style: TextStyle(
                          color: Color(0xFF0F766E),
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        dateStr,
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                  if (_summary != null) _buildRatingBadge(_summary!.overallRating),
                ],
              ),
            ),

            if (_loading) ...[
              const SizedBox(height: 80),
              const Center(
                child: Column(
                  children: [
                    CircularProgressIndicator(color: Color(0xFF0F766E)),
                    SizedBox(height: 16),
                    Text(
                      'Gemini AI is analyzing your day...',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    SizedBox(height: 6),
                    Text(
                      'Synthesizing meals, steps, and target progress.',
                      style: TextStyle(color: Colors.grey, fontSize: 13),
                    ),
                  ],
                ),
              ),
            ] else if (_error != null) ...[
              const SizedBox(height: 60),
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    const Icon(Icons.error_outline_rounded, size: 48, color: Colors.red),
                    const SizedBox(height: 12),
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _generateSummary,
                      child: const Text('Try Again'),
                    ),
                  ],
                ),
              ),
            ] else if (_summary == null) ...[
              const SizedBox(height: 60),
              Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F766E).withOpacity(0.08),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.psychology_alt_outlined, size: 50, color: Color(0xFF0F766E)),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Generate AI Daily Review',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Get an encouraging breakdown of your caloric balance, nutrition quality (protein, fiber, sugar), and personalized suggestions for tomorrow.',
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 14, height: 1.4),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 28),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton.icon(
                        onPressed: _generateSummary,
                        icon: const Icon(Icons.auto_awesome),
                        label: const Text('Generate Summary'),
                      ),
                    ),
                  ],
                ),
              ),
            ] else ...[
              // Summary Content
              Card(
                margin: const EdgeInsets.all(16),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _statBox('Calories In', '~${_summary!.totalCaloriesIn.round()}', '🍽️'),
                          _statBox('Burned', '~${_summary!.totalCaloriesBurned.round()}', '🔥'),
                          _statBox('Steps', NumberFormat('#,###').format(_summary!.steps), '👟'),
                        ],
                      ),
                      const Divider(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _macroMini('Protein', '${_summary!.macroSummary.proteinG.round()}g'),
                          _macroMini('Carbs', '${_summary!.macroSummary.carbsG.round()}g'),
                          _macroMini('Fat', '${_summary!.macroSummary.fatG.round()}g'),
                          _macroMini('Fiber', '${_summary!.macroSummary.fiberG.round()}g'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              // Pros
              if (_summary!.pros.isNotEmpty)
                _buildListCard(
                  title: 'What Went Well Today',
                  icon: Icons.check_circle_outline_rounded,
                  iconColor: Colors.green.shade700,
                  items: _summary!.pros,
                ),

              // Cons
              if (_summary!.cons.isNotEmpty)
                _buildListCard(
                  title: 'Areas to Improve',
                  icon: Icons.info_outline_rounded,
                  iconColor: Colors.amber.shade800,
                  items: _summary!.cons,
                ),

              // Suggestions
              if (_summary!.suggestions.isNotEmpty)
                _buildListCard(
                  title: 'Suggestions for Tomorrow',
                  icon: Icons.lightbulb_outline_rounded,
                  iconColor: const Color(0xFF0F766E),
                  items: _summary!.suggestions,
                ),

              const MedicalDisclaimerNote(),
              const SizedBox(height: 20),
            ],
          ],
        ),
      ),
    );
  }

  Widget _statBox(String label, String value, String icon) {
    return Column(
      children: [
        Text('$icon $value', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
      ],
    );
  }

  Widget _macroMini(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
        Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
      ],
    );
  }
}
