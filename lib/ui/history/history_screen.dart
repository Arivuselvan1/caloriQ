import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../domain/entities/food_entry.dart';
import '../providers.dart';

class HistoryScreen extends ConsumerStatefulWidget {
  final VoidCallback onNavigateToToday;

  const HistoryScreen({super.key, required this.onNavigateToToday});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  CalendarFormat _calendarFormat = CalendarFormat.month;
  DateTime _focusedDay = DateTime.now();

  @override
  Widget build(BuildContext context) {
    final selectedDate = ref.watch(selectedDateProvider);
    final entriesAsync = ref.watch(foodEntriesForSelectedDateProvider);
    final totals = ref.watch(dailyTotalsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Log History'),
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            child: TableCalendar(
              firstDay: DateTime(2022, 1, 1),
              lastDay: DateTime.now().add(const Duration(days: 30)),
              focusedDay: _focusedDay,
              calendarFormat: _calendarFormat,
              selectedDayPredicate: (day) => isSameDay(selectedDate, day),
              onDaySelected: (selectedDay, focusedDay) {
                ref.read(selectedDateProvider.notifier).state =
                    DateTime(selectedDay.year, selectedDay.month, selectedDay.day);
                setState(() => _focusedDay = focusedDay);
              },
              onFormatChanged: (format) {
                setState(() => _calendarFormat = format);
              },
              calendarStyle: CalendarStyle(
                selectedDecoration: BoxDecoration(
                  color: theme.colorScheme.primary,
                  shape: BoxShape.circle,
                ),
                todayDecoration: BoxDecoration(
                  color: theme.colorScheme.primary.withOpacity(0.3),
                  shape: BoxShape.circle,
                ),
              ),
              headerStyle: const HeaderStyle(
                formatButtonVisible: true,
                titleCentered: true,
              ),
            ),
          ),
          const Divider(height: 1),

          // Selected day summary bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            color: const Color(0xFFF8FAFC),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      DateFormat('MMMM d, yyyy').format(selectedDate),
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                    ),
                    Text(
                      '${totals.entryCount} items • ~${totals.calories.round()} kcal logged',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ],
                ),
                OutlinedButton.icon(
                  onPressed: widget.onNavigateToToday,
                  icon: const Icon(Icons.edit_note, size: 18),
                  label: const Text('Open in Sheet'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    textStyle: const TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
          ),

          // Items list for the selected day
          Expanded(
            child: entriesAsync.when(
              data: (entries) {
                if (entries.isEmpty) {
                  return Center(
                    child: Text(
                      'No food records for this day.',
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: entries.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (ctx, idx) {
                    final item = entries[idx];
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      leading: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F766E).withOpacity(0.08),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          item.mealType.substring(0, 1).toUpperCase(),
                          style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0F766E)),
                        ),
                      ),
                      title: Text(item.foodName, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        '${item.time} • P: ${item.protein.round()}g | C: ${item.carbs.round()}g | F: ${item.fat.round()}g',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                      trailing: Text(
                        '~${item.calories.round()} kcal',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
          ),
        ],
      ),
    );
  }
}
