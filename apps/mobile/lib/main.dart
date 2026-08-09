import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'screens/driver_home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/parent_home_screen.dart';
import 'screens/teacher_home_screen.dart';
import 'services/auth_state.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(const SchoolKidsApp());
}

class SchoolKidsApp extends StatelessWidget {
  const SchoolKidsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AuthState(),
      child: MaterialApp(
        title: 'SchoolKids Tracker',
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: const RootGate(),
      ),
    );
  }
}

class RootGate extends StatelessWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();

    if (auth.loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (!auth.isLoggedIn) return const LoginScreen();

    switch (auth.role) {
      case 'driver':
        return const DriverHomeScreen();
      case 'teacher':
        return const TeacherHomeScreen();
      case 'parent':
        return const ParentHomeScreen();
      case 'admin':
        return const _AdminHintScreen();
      default:
        return const LoginScreen();
    }
  }
}

class _AdminHintScreen extends StatelessWidget {
  const _AdminHintScreen();

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthState>();
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Admin is available on the web dashboard.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              const Text(
                'Use parent, teacher, or driver accounts in this mobile app.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: auth.logout,
                child: const Text('Sign out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
