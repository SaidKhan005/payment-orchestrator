import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/payment_service.dart';
import '../../models/payment_intent.dart';
import '../../widgets/payment_card.dart';
import 'payment_detail_screen.dart';

class PaymentsListScreen extends StatefulWidget {
  const PaymentsListScreen({super.key});

  @override
  State<PaymentsListScreen> createState() => _PaymentsListScreenState();
}

class _PaymentsListScreenState extends State<PaymentsListScreen> {
  String? _selectedState;
  bool _isLoading = false;
  List<PaymentIntent> _payments = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPayments();
  }

  Future<void> _loadPayments() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final paymentService = context.read<PaymentService>();
      final payments = await paymentService.getPayments(
        state: _selectedState,
        limit: 50,
      );

      setState(() {
        _payments = payments;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // State filter chips
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildFilterChip('ALL', null),
                const SizedBox(width: 8),
                _buildFilterChip('INIT', 'INIT'),
                const SizedBox(width: 8),
                _buildFilterChip('AUTHORIZED', 'AUTHORIZED'),
                const SizedBox(width: 8),
                _buildFilterChip('CLOSED', 'CLOSED'),
                const SizedBox(width: 8),
                _buildFilterChip('FAILED', 'FAILED'),
              ],
            ),
          ),
        ),
        const Divider(height: 1),
        // Payments list
        Expanded(
          child: _buildBody(),
        ),
      ],
    );
  }

  Widget _buildFilterChip(String label, String? state) {
    final isSelected = _selectedState == state;

    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (selected) {
        setState(() {
          _selectedState = state;
        });
        _loadPayments();
      },
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text(
              'Error loading payments',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _loadPayments,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (_payments.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.payment_outlined,
                size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              'No payments found',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              _selectedState != null
                  ? 'No payments with state $_selectedState'
                  : 'No payments yet',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadPayments,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _payments.length,
        itemBuilder: (context, index) {
          final payment = _payments[index];
          return PaymentCard(
            payment: payment,
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => PaymentDetailScreen(payment: payment),
                ),
              ).then((_) => _loadPayments());
            },
          );
        },
      ),
    );
  }
}
