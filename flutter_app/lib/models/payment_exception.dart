class PaymentException {
  final int exceptionId;
  final String? intentId;
  final String exceptionType;
  final String severity;
  final String? message;
  final String? stackTrace;
  final bool resolved;
  final DateTime createdAt;

  PaymentException({
    required this.exceptionId,
    this.intentId,
    required this.exceptionType,
    required this.severity,
    this.message,
    this.stackTrace,
    required this.resolved,
    required this.createdAt,
  });

  factory PaymentException.fromJson(Map<String, dynamic> json) {
    return PaymentException(
      exceptionId: json['exception_id'],
      intentId: json['intent_id'],
      exceptionType: json['exception_type'],
      severity: json['severity'],
      message: json['message'],
      stackTrace: json['stack_trace'],
      resolved: json['resolved'],
      createdAt: DateTime.parse(json['created_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'exception_id': exceptionId,
      'intent_id': intentId,
      'exception_type': exceptionType,
      'severity': severity,
      'message': message,
      'stack_trace': stackTrace,
      'resolved': resolved,
      'created_at': createdAt.toIso8601String(),
    };
  }
}
