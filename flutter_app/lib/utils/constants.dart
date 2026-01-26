import 'package:flutter/material.dart';

class AppColors {
  static const Color success = Color(0xFF4CAF50);
  static const Color error = Color(0xFFE53935);
  static const Color warning = Color(0xFFFFA726);
  static const Color info = Color(0xFF42A5F5);
}

class PaymentStates {
  static const String init = 'INIT';
  static const String checkSplit = 'CHECK_SPLIT';
  static const String authorized = 'AUTHORIZED';
  static const String tendered = 'TENDERED';
  static const String closed = 'CLOSED';
  static const String failed = 'FAILED';
  static const String voided = 'VOIDED';
}

class ApiEndpoints {
  static const String payments = '/api/payments';
  static const String checks = '/api/checks';
  static const String exceptions = '/api/exceptions';
}
