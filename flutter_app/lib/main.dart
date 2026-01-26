import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'services/api_service.dart';
import 'services/payment_service.dart';
import 'screens/home/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Load environment variables
  try {
    await dotenv.load(fileName: ".env");
  } catch (e) {
    print('Warning: Could not load .env file: $e');
  }

  runApp(const PaymentOrchestratorApp());
}

class PaymentOrchestratorApp extends StatelessWidget {
  const PaymentOrchestratorApp({super.key});

  @override
  Widget build(BuildContext context) {
    final apiService = ApiService(
      baseUrl: dotenv.env['API_BASE_URL'] ?? 'http://localhost:3000',
      apiKey: dotenv.env['API_KEY'] ?? 'dev_api_key_change_in_prod',
    );

    return MultiProvider(
      providers: [
        Provider<ApiService>.value(value: apiService),
        ProxyProvider<ApiService, PaymentService>(
          update: (context, apiService, previous) => PaymentService(apiService),
        ),
      ],
      child: MaterialApp(
        title: 'Payment Orchestrator',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: Colors.blue,
            brightness: Brightness.light,
          ),
          textTheme: GoogleFonts.interTextTheme(),
        ),
        darkTheme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: Colors.blue,
            brightness: Brightness.dark,
          ),
          textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
        ),
        themeMode: ThemeMode.system,
        home: const HomeScreen(),
      ),
    );
  }
}
