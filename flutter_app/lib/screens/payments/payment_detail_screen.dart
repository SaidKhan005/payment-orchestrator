import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../models/payment_intent.dart';
import '../../services/payment_service.dart';
import '../../utils/formatters.dart';
import '../../utils/constants.dart';

class PaymentDetailScreen extends StatefulWidget {
  final PaymentIntent payment;

  const PaymentDetailScreen({
    super.key,
    required this.payment,
  });

  @override
  State<PaymentDetailScreen> createState() => _PaymentDetailScreenState();
}

class _PaymentDetailScreenState extends State<PaymentDetailScreen> {
  bool _isRecovering = false;
  String? _recoveryMessage;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment Details'),
        actions: [
          IconButton(
            icon: const Icon(Icons.copy),
            onPressed: () {
              Clipboard.setData(ClipboardData(text: widget.payment.intentId));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Intent ID copied')),
              );
            },
            tooltip: 'Copy Intent ID',
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // State card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        _getStateIcon(widget.payment.state),
                        color: _getStateColor(widget.payment.state),
                        size: 32,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.payment.state,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(
                                    color: _getStateColor(widget.payment.state),
                                    fontWeight: FontWeight.bold,
                                  ),
                            ),
                            Text(
                              Formatters.formatCurrency(widget.payment.amount),
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Details card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Payment Information',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 16),
                  _buildDetailRow('Intent ID', widget.payment.shortIntentId),
                  _buildDetailRow('Master Check', widget.payment.masterCheckRef),
                  if (widget.payment.childCheckRef != null)
                    _buildDetailRow('Child Check', widget.payment.childCheckRef!),
                  _buildDetailRow('RVC', widget.payment.rvcRef.toString()),
                  if (widget.payment.employeeRef != null)
                    _buildDetailRow('Employee', widget.payment.employeeRef!),
                  if (widget.payment.authId != null)
                    _buildDetailRow('Auth ID', widget.payment.authId!),
                  if (widget.payment.seatItems != null)
                    _buildDetailRow(
                      'Seat Items',
                      widget.payment.seatItems!.join(', '),
                    ),
                  _buildDetailRow(
                    'Created',
                    Formatters.formatDateTime(widget.payment.createdAt),
                  ),
                  _buildDetailRow(
                    'Updated',
                    Formatters.formatDateTime(widget.payment.updatedAt),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Recovery message
          if (_recoveryMessage != null)
            Card(
              color: Colors.green.shade50,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Icon(Icons.check_circle, color: Colors.green.shade700),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _recoveryMessage!,
                        style: TextStyle(color: Colors.green.shade900),
                      ),
                    ),
                  ],
                ),
              ),
            ),

          // Recovery button
          if (widget.payment.state == 'FAILED' ||
              widget.payment.state == 'AUTHORIZED' ||
              widget.payment.state == 'TENDERED')
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: FilledButton.icon(
                onPressed: _isRecovering ? null : _recoverPayment,
                icon: _isRecovering
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
                label: Text(_isRecovering ? 'Recovering...' : 'Recover Payment'),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                    color: Colors.grey.shade600,
                  ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    );
  }

  IconData _getStateIcon(String state) {
    switch (state) {
      case 'CLOSED':
        return Icons.check_circle;
      case 'FAILED':
        return Icons.error;
      case 'AUTHORIZED':
        return Icons.verified;
      case 'TENDERED':
        return Icons.payment;
      default:
        return Icons.hourglass_empty;
    }
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

  Future<void> _recoverPayment() async {
    setState(() {
      _isRecovering = true;
      _recoveryMessage = null;
    });

    try {
      final paymentService = context.read<PaymentService>();
      await paymentService.recoverPayment(widget.payment.intentId);

      setState(() {
        _isRecovering = false;
        _recoveryMessage = 'Payment recovered successfully';
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Payment recovered successfully'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      setState(() {
        _isRecovering = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Recovery failed: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}
