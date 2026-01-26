# Payment Orchestrator
Ledger-safe payment orchestration for Oracle Simphony POS systems.

## Quick Start
### Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Simphony credentials
createdb payment_orchestrator
node scripts/migrate.js
npm run dev
```

### Flutter App
```bash
cd flutter_app
flutter pub get
cp .env.example .env
flutter run
```

## Architecture
- Backend: Node.js + Express + PostgreSQL
- Mobile: Flutter monitoring dashboard
- POS: Oracle Simphony STS API integration
- Gateway: Mock (testing) / Elavon (production)

## Features
- Ledger-safe check splitting before payment
- Idempotent payment processing
- Automatic recovery from failures
- Real-time monitoring dashboard
- Comprehensive exception tracking

## Documentation
- [API Documentation](docs/API.md)
- [Setup Guide](docs/SETUP.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
