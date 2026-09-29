import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'services/workmanager_service.dart';
import 'ui/app.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase (safely handles dev environments without google-services.json)
  try {
    await Firebase.initializeApp();
  } catch (e) {
    print('Firebase initialization notice: $e');
  }

  // Initialize background tasks (Health Connect hourly sync)
  try {
    await WorkmanagerService.initialize();
  } catch (e) {
    print('WorkManager initialization notice: $e');
  }

  runApp(
    const ProviderScope(
      child: CaloriqApp(),
    ),
  );
}

class CaloriqApp extends StatelessWidget {
  const CaloriqApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CaloriQ',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const CaloriqAppShell(),
    );
  }
}
