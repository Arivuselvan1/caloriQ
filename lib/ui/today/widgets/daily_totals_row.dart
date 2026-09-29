import 'package:flutter/material.dart';
import '../../providers.dart';

class DailyTotalsRow extends StatelessWidget {
  final DailyFoodTotals totals;
  final ScrollController scrollController;

  const DailyTotalsRow({
    super.key,
    required this.totals,
    required this.scrollController,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0F766E).withOpacity(0.08),
        border: const Border(
          top: BorderSide(color: Color(0xFF0F766E), width: 1.5),
          bottom: BorderSide(color: Color(0xFFE2E8F0)),
        ),
      ),
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: SingleChildScrollView(
        controller: scrollController,
        scrollDirection: Axis.horizontal,
        physics: const ClampingScrollPhysics(),
        child: Row(
          children: [
            const SizedBox(
              width: 80, // Time
              child: Center(
                child: Text(
                  'TOTALS',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: Color(0xFF0F766E)),
                ),
              ),
            ),
            const SizedBox(width: 80), // Meal Type
            SizedBox(
              width: 140, // Food name
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  '${totals.entryCount} items logged',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF0F766E)),
                ),
              ),
            ),
            const SizedBox(width: 80), // Quantity
            SizedBox(
              width: 75, // Calories
              child: Center(
                child: Text(
                  '${totals.calories.round()}',
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Color(0xFF0F766E)),
                ),
              ),
            ),
            SizedBox(
              width: 65, // Protein
              child: Center(
                child: Text(
                  '${totals.protein.round()}g',
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: Color(0xFF0F766E)),
                ),
              ),
            ),
            SizedBox(
              width: 65, // Carbs
              child: Center(
                child: Text(
                  '${totals.carbs.round()}g',
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: Color(0xFF0F766E)),
                ),
              ),
            ),
            SizedBox(
              width: 65, // Fat
              child: Center(
                child: Text(
                  '${totals.fat.round()}g',
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: Color(0xFF0F766E)),
                ),
              ),
            ),
            SizedBox(
              width: 65, // Fiber
              child: Center(
                child: Text(
                  '${totals.fiber.round()}g',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: Color(0xFF0F766E)),
                ),
              ),
            ),
            SizedBox(
              width: 65, // Sugar
              child: Center(
                child: Text(
                  '${totals.sugar.round()}g',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: Color(0xFF0F766E)),
                ),
              ),
            ),
            SizedBox(
              width: 75, // Sodium
              child: Center(
                child: Text(
                  '${totals.sodium.round()}mg',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: Color(0xFF0F766E)),
                ),
              ),
            ),
            const SizedBox(width: 70), // Source
            const SizedBox(width: 50), // Actions
          ],
        ),
      ),
    );
  }
}
