import 'package:flutter/material.dart';

class EstimateDisclaimerBanner extends StatefulWidget {
  const EstimateDisclaimerBanner({super.key});

  @override
  State<EstimateDisclaimerBanner> createState() => _EstimateDisclaimerBannerState();
}

class _EstimateDisclaimerBannerState extends State<EstimateDisclaimerBanner> {
  bool _dismissed = false;

  @override
  Widget build(BuildContext context) {
    if (_dismissed) return const SizedBox.shrink();

    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF3C7), // Warm amber background
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFDE68A)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Icon(Icons.info_outline_rounded, color: Color(0xFFD97706), size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Calorie and nutritional values are estimates. Actual values may vary based on ingredients and preparation.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: const Color(0xFF92400E),
                fontWeight: FontWeight.w500,
                height: 1.3,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 18, color: Color(0xFF92400E)),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
            onPressed: () {
              setState(() {
                _dismissed = true;
              });
            },
          ),
        ],
      ),
    );
  }
}
