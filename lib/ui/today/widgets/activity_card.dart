import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../providers.dart';

class ActivityCard extends ConsumerStatefulWidget {
  const ActivityCard({super.key});

  @override
  ConsumerState<ActivityCard> createState() => _ActivityCardState();
}

class _ActivityCardState extends ConsumerState<ActivityCard> {
  bool _syncing = false;

  Future<void> _handleSync() async {
    setState(() => _syncing = true);
    try {
      final profile = ref.read(userProfileProvider).valueOrNull;
      final userBmr = profile?.bmr ?? 1700.0;
      await ref.read(healthRepositoryProvider).syncTodayHealth(userBmr: userBmr);
      // Invalidate stream to reload
      ref.invalidate(healthDataForSelectedDateProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Health metrics synchronized successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Health sync: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final healthAsync = ref.watch(healthDataForSelectedDateProvider);
    final theme = Theme.of(context);

    return healthAsync.when(
      data: (health) {
        final steps = health?.steps ?? 0;
        final totalCalories = health?.totalCaloriesBurned ?? 0.0;
        final activeCalories = health?.activeCaloriesBurned ?? 0.0;
        final isEstimated = health?.isEstimated ?? true;
        final lastSynced = health?.lastSyncedAt != null
            ? DateFormat('hh:mm a').format(health!.lastSyncedAt!)
            : 'Not yet synced';

        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(Icons.directions_run_rounded,
                              color: theme.colorScheme.primary, size: 20),
                        ),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Physical Activity',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                            ),
                            Text(
                              'Health Connect • Synced: $lastSynced',
                              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                            ),
                          ],
                        ),
                      ],
                    ),
                    IconButton(
                      icon: _syncing
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.sync_rounded, size: 20),
                      tooltip: 'Sync with Health Connect',
                      onPressed: _syncing ? null : _handleSync,
                    ),
                  ],
                ),
                const Divider(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                NumberFormat('#,###').format(steps),
                                style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(width: 4),
                              const Text('👟', style: TextStyle(fontSize: 16)),
                            ],
                          ),
                          Text(
                            'Steps Taken',
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                          ),
                        ],
                      ),
                    ),
                    Container(width: 1, height: 40, color: Colors.grey.shade200),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                '~${totalCalories.round()}',
                                style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(width: 4),
                              const Text('🔥', style: TextStyle(fontSize: 16)),
                              if (isEstimated)
                                Container(
                                  margin: const EdgeInsets.only(left: 4),
                                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: Colors.amber.shade100,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    'Est',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.brown),
                                  ),
                                ),
                            ],
                          ),
                          Text(
                            'Total Burn (Active: ~${activeCalories.round()} kcal)',
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
      loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
      error: (e, _) => Card(
        margin: const EdgeInsets.all(16),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text('Could not load health metrics: $e'),
        ),
      ),
    );
  }
}
