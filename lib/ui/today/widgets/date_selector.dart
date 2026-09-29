import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../providers.dart';

class DateSelector extends ConsumerWidget {
  const DateSelector({super.key});

  String _formatDateTitle(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(date.year, date.month, date.day);

    final diff = target.difference(today).inDays;
    if (diff == 0) return 'Today';
    if (diff == -1) return 'Yesterday';
    if (diff == 1) return 'Tomorrow';
    return DateFormat('EEE, MMM d, yyyy').format(date);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedDate = ref.watch(selectedDateProvider);
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Colors.white,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left_rounded),
            tooltip: 'Previous Day',
            onPressed: () {
              ref.read(selectedDateProvider.notifier).state =
                  selectedDate.subtract(const Duration(days: 1));
            },
          ),
          InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: selectedDate,
                firstDate: DateTime(2020),
                lastDate: DateTime.now().add(const Duration(days: 365)),
                builder: (context, child) {
                  return Theme(
                    data: theme.copyWith(
                      colorScheme: theme.colorScheme.copyWith(
                        primary: theme.colorScheme.primary,
                      ),
                    ),
                    child: child!,
                  );
                },
              );
              if (picked != null) {
                ref.read(selectedDateProvider.notifier).state =
                    DateTime(picked.year, picked.month, picked.day);
              }
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.calendar_today_rounded, size: 18, color: theme.colorScheme.primary),
                  const SizedBox(width: 8),
                  Text(
                    _formatDateTitle(selectedDate),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.arrow_drop_down, size: 20),
                ],
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right_rounded),
            tooltip: 'Next Day',
            onPressed: () {
              ref.read(selectedDateProvider.notifier).state =
                  selectedDate.add(const Duration(days: 1));
            },
          ),
        ],
      ),
    );
  }
}
