import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'camera/camera_screen.dart';
import 'history/history_screen.dart';
import 'onboarding/onboarding_screen.dart';
import 'profile/profile_screen.dart';
import 'providers.dart';
import 'summary/summary_screen.dart';
import 'today/today_screen.dart';

class CaloriqAppShell extends ConsumerStatefulWidget {
  const CaloriqAppShell({super.key});

  @override
  ConsumerState<CaloriqAppShell> createState() => _CaloriqAppShellState();
}

class _CaloriqAppShellState extends ConsumerState<CaloriqAppShell> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(userProfileProvider);

    return profileAsync.when(
      data: (profile) {
        if (profile == null || !profile.onboardingComplete) {
          return OnboardingScreen(
            onComplete: () {
              ref.invalidate(userProfileProvider);
            },
          );
        }

        final screens = [
          const TodayScreen(),
          HistoryScreen(
            onNavigateToToday: () {
              setState(() => _currentIndex = 0);
            },
          ),
          const SummaryScreen(),
          const ProfileScreen(),
        ];

        return Scaffold(
          body: IndexedStack(
            index: _currentIndex,
            children: screens,
          ),
          floatingActionButton: FloatingActionButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (ctx) => const CameraScreen()),
              );
            },
            backgroundColor: const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            elevation: 4,
            tooltip: 'Scan Food Photo',
            child: const Icon(Icons.photo_camera_rounded, size: 26),
          ),
          floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
          bottomNavigationBar: BottomAppBar(
            shape: const CircularNotchedRectangle(),
            notchMargin: 8,
            color: Colors.white,
            elevation: 8,
            child: SizedBox(
              height: 60,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _navItem(0, Icons.table_chart_outlined, Icons.table_chart_rounded, 'Today'),
                  _navItem(1, Icons.calendar_month_outlined, Icons.calendar_month_rounded, 'History'),
                  const SizedBox(width: 48), // Gap for docked center FAB
                  _navItem(2, Icons.auto_awesome_outlined, Icons.auto_awesome_rounded, 'Summary'),
                  _navItem(3, Icons.person_outline_rounded, Icons.person_rounded, 'Profile'),
                ],
              ),
            ),
          ),
        );
      },
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator(color: Color(0xFF0F766E))),
      ),
      error: (e, _) => Scaffold(
        body: Center(child: Text('Error: $e')),
      ),
    );
  }

  Widget _navItem(int index, IconData outlineIcon, IconData filledIcon, String label) {
    final isSelected = _currentIndex == index;
    final color = isSelected ? const Color(0xFF0F766E) : Colors.grey.shade500;

    return InkWell(
      onTap: () => setState(() => _currentIndex = index),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(isSelected ? filledIcon : outlineIcon, color: color, size: 22),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
