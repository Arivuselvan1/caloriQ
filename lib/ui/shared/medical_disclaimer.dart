import 'package:flutter/material.dart';

class MedicalDisclaimerNote extends StatelessWidget {
  const MedicalDisclaimerNote({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.health_and_safety_outlined, size: 16, color: Colors.grey.shade600),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Not medical advice: CaloriQ is intended strictly for general informational and tracking purposes. '
              'Always consult a qualified physician or registered dietitian before beginning any significant diet, caloric deficit, or exercise program.',
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey.shade600,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
