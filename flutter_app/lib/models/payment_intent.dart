class PaymentIntent {
  final String intentId;
  final String masterCheckRef;
  final String? childCheckRef;
  final int rvcRef;
  final double amount;
  final String state;
  final String? authId;
  final String? gatewayReference;
  final List<int>? seatItems;
  final String? employeeRef;
  final DateTime createdAt;
  final DateTime updatedAt;

  PaymentIntent({
    required this.intentId,
    required this.masterCheckRef,
    this.childCheckRef,
    required this.rvcRef,
    required this.amount,
    required this.state,
    this.authId,
    this.gatewayReference,
    this.seatItems,
    this.employeeRef,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PaymentIntent.fromJson(Map<String, dynamic> json) {
    return PaymentIntent(
      intentId: json['intent_id'],
      masterCheckRef: json['master_check_ref'],
      childCheckRef: json['child_check_ref'],
      rvcRef: json['rvc_ref'],
      amount: double.parse(json['amount'].toString()),
      state: json['state'],
      authId: json['auth_id'],
      gatewayReference: json['gateway_reference'],
      seatItems: json['seat_items'] != null
          ? List<int>.from(json['seat_items'])
          : null,
      employeeRef: json['employee_ref'],
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'intent_id': intentId,
      'master_check_ref': masterCheckRef,
      'child_check_ref': childCheckRef,
      'rvc_ref': rvcRef,
      'amount': amount,
      'state': state,
      'auth_id': authId,
      'gateway_reference': gatewayReference,
      'seat_items': seatItems,
      'employee_ref': employeeRef,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  String get shortIntentId {
    return intentId.substring(0, 8);
  }
}
