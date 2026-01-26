import 'package:flutter/material.dart';

import '../models/payment_intent.dart';
import '../utils/formatters.dart';
import '../utils/constants.dart';

class PaymentCard extends StatelessWidget {
  final PaymentIntent payment;
  final VoidCallback onTap;

  const PaymentCard({
    super.key,
    required this.payment,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // State indicator
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _getStateColor(payment.state).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      payment.state,
                      style: TextStyle(
                        color: _getStateColor(payment.state),
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  const Spacer(),
                  // Amount
                  Text(
                    Formatters.formatCurrency(payment.amount),
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Intent ID
              Row(
                children: [
                  Icon(Icons.fingerprint,
                      size: 16, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    payment.shortIntentId,
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              // Check references
              Row(
                children: [
                  Icon(Icons.receipt, size: 16, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    'Check: ${payment.masterCheckRef}',
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontSize: 14,
                    ),
                  ),
                  if (payment.childCheckRef != null) ...[
                    const SizedBox(width: 8),
                    Icon(Icons.arrow_forward,
                        size: 12, color: Colors.grey.shade400),
                    const SizedBox(width: 4),
                    Text(
                      payment.childCheckRef!,
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              // Timestamp
              Row(
                children: [
                  Icon(Icons.access_time, size: 16, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    Formatters.formatRelativeTime(payment.createdAt),
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getStateColor(String state) {
    switch (state) {
      case 'CLOSED':
        return AppColors.success;
      case 'FAILED':
        return AppColors.error;
      case 'AUTHORIZED':
        return AppColors.warning;
      case 'TENDERED':
        return AppColors.info;
      default:
        return Colors.grey;
    }
  }
}
