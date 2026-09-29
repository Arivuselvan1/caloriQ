import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../providers.dart';
import 'review_screen.dart';

class CameraScreen extends ConsumerStatefulWidget {
  const CameraScreen({super.key});

  @override
  ConsumerState<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends ConsumerState<CameraScreen> {
  final ImagePicker _picker = ImagePicker();
  bool _analyzing = false;
  File? _selectedImage;

  Future<void> _captureOrPick(ImageSource source) async {
    try {
      final picked = await _picker.pickImage(
        source: source,
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (picked == null) return;

      final file = File(picked.path);
      setState(() {
        _selectedImage = file;
        _analyzing = true;
      });

      final bytes = await file.readAsBytes();
      final userRepo = ref.read(userRepositoryProvider);
      final deviceId = await userRepo.getOrCreateDeviceId();

      final aiRepo = ref.read(aiRepositoryProvider);
      final response = await aiRepo.analyzeFoodPhoto(
        imageBytes: bytes,
        mimeType: 'image/jpeg',
        deviceId: deviceId,
      );

      if (!mounted) return;
      setState(() => _analyzing = false);

      if (response.isNoFoodDetected) {
        _showNoFoodDialog(response.message ?? 'No food detected in this photo.');
        return;
      }

      if (response.items.isEmpty) {
        _showNoFoodDialog('Could not detect distinct food items. Please try another angle.');
        return;
      }

      // Navigate to Review Screen
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (ctx) => ReviewScreen(initialItems: response.items),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _analyzing = false);
      _showErrorDialog(e.toString());
    }
  }

  void _showNoFoodDialog(String message) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.no_meals_rounded, size: 40, color: Colors.amber),
        title: const Text('No Food Detected'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              _captureOrPick(ImageSource.camera);
            },
            child: const Text('Try Again'),
          ),
        ],
      ),
    );
  }

  void _showErrorDialog(String error) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.error_outline_rounded, size: 40, color: Colors.red),
        title: const Text('Analysis Failed'),
        content: Text(error),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_analyzing) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_selectedImage != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Image.file(_selectedImage!, height: 180, width: 180, fit: BoxFit.cover),
                  ),
                const SizedBox(height: 24),
                const CircularProgressIndicator(color: Color(0xFF0F766E)),
                const SizedBox(height: 20),
                const Text(
                  'Gemini AI is analyzing your food...',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Identifying ingredients, estimating portion weights, and calculating nutritional macros.',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                TextButton(
                  onPressed: () => setState(() => _analyzing = false),
                  child: const Text('Cancel'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Food Photo'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withOpacity(0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.camera_alt_outlined, size: 64, color: theme.colorScheme.primary),
            ),
            const SizedBox(height: 24),
            const Text(
              'Snap a Photo of Your Meal',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              'Take or upload a photo of your plate. Gemini AI will identify food items, calculate portion sizes, and log estimated calories and macros.',
              style: TextStyle(fontSize: 14, color: Colors.grey.shade600, height: 1.4),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 36),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: () => _captureOrPick(ImageSource.camera),
                icon: const Icon(Icons.photo_camera_rounded),
                label: const Text('Take Food Photo'),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton.icon(
                onPressed: () => _captureOrPick(ImageSource.gallery),
                icon: const Icon(Icons.photo_library_rounded),
                label: const Text('Choose from Gallery'),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFF0F766E)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
