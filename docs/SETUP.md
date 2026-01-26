# Payment Orchestrator Setup Guide

## Prerequisites

### Backend
- Node.js 18+ and npm
- PostgreSQL 15+
- Git

### Flutter App
- Flutter SDK 3.0+
- Dart SDK
- Android Studio / Xcode (for mobile development)

---

## Development Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd payment-orchestrator
```

### 2. Backend Setup

#### Install Dependencies

```bash
cd backend
npm install
```

#### Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://localhost:5432/payment_orchestrator

# Oracle Simphony STS
STS_BASE_URL=https://bits-sts.oraclemicros.com/api/v1
AUTHORIZE_URL=https://ors-idm.bits.oraclerestaurants.com/oidc-provider/v1/oauth2/authorize
SIGNIN_URL=https://ors-idm.bits.oraclerestaurants.com/oidc-provider/v1/oauth2/signin
TOKEN_URL=https://ors-idm.bits.oraclerestaurants.com/oidc-provider/v1/oauth2/token
CLIENT_ID=your_client_id_here
API_USERNAME=your_api_username
API_PASSWORD=your_api_password
REDIRECT_URI=apiaccount://callback
SCOPE=openid
ORG_SHORT_NAME=YOUR_ORG
LOC_REF=your_location_ref

# Gateway (Mock for development)
USE_MOCK_GATEWAY=true
MOCK_FAILURE_RATE=0.1
MOCK_TIMEOUT_RATE=0.05
MOCK_LATENCY_MS=500

# Security
API_KEY=your_secure_api_key_here
```

#### Setup Database

```bash
# Create database
createdb payment_orchestrator

# Run migrations
npm run db:migrate

# Seed test data (optional)
npm run db:seed
```

#### Start Backend

```bash
npm run dev
```

The backend should now be running at `http://localhost:3000`.

#### Verify Backend

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "development",
  "database": "connected"
}
```

---

### 3. Flutter App Setup

#### Install Dependencies

```bash
cd flutter_app
flutter pub get
```

#### Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
API_BASE_URL=http://localhost:3000
API_KEY=your_secure_api_key_here
```

**Note:** For iOS simulator, use `http://localhost:3000`. For Android emulator, use `http://10.0.2.2:3000`.

#### Run Flutter App

```bash
flutter run
```

Or open in your IDE and run from there.

---

## Docker Setup (Alternative)

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

This will start:
- PostgreSQL on port 5432
- Backend API on port 3000

The database migrations will run automatically on first start.

---

## Production Deployment

### Backend

#### 1. Prepare Environment

```bash
export NODE_ENV=production
export DATABASE_URL=postgresql://user:password@host:5432/payment_orchestrator
export USE_MOCK_GATEWAY=false
# Configure real gateway credentials
export API_KEY=generate_strong_random_key
```

#### 2. Build and Deploy

```bash
npm ci --only=production
node scripts/migrate.js
node src/server.js
```

#### 3. Use Process Manager

```bash
npm install -g pm2
pm2 start src/server.js --name payment-orchestrator
pm2 save
pm2 startup
```

### Database

#### Production Database Setup

```sql
-- Create production database
CREATE DATABASE payment_orchestrator;

-- Create dedicated user
CREATE USER orchestrator WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE payment_orchestrator TO orchestrator;

-- Connect and run migrations
\c payment_orchestrator
-- Run migration SQL from db/migrations/001_initial_schema.sql
```

#### Backup Strategy

```bash
# Daily backups
pg_dump payment_orchestrator > backup_$(date +%Y%m%d).sql

# Restore
psql payment_orchestrator < backup_20240115.sql
```

### Flutter App

#### Build for Production

**Android:**
```bash
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

**iOS:**
```bash
flutter build ios --release
# Follow Xcode signing and distribution process
```

#### Configure Production API

Update `.env` with production API URL:
```env
API_BASE_URL=https://api.yourcompany.com
API_KEY=production_api_key
```

---

## Testing

### Backend Tests

```bash
cd backend

# Run test suite
npm test

# Test specific flow
node tests/test-payment-flow.js
```

### Flutter Tests

```bash
cd flutter_app

# Run all tests
flutter test

# Run with coverage
flutter test --coverage
```

---

## Monitoring

### Backend Logs

Logs are written to:
- `backend/logs/combined.log` - All logs
- `backend/logs/error.log` - Error logs only

View live logs:
```bash
tail -f backend/logs/combined.log
```

### Database Monitoring

Check payment intent states:
```sql
SELECT state, COUNT(*)
FROM payment_intents
GROUP BY state;
```

Check recent exceptions:
```sql
SELECT *
FROM payment_exceptions
WHERE resolved = false
ORDER BY created_at DESC
LIMIT 10;
```

### Health Checks

Set up automated health checks:
```bash
*/5 * * * * curl -f http://localhost:3000/health || alert
```

---

## Troubleshooting

### Backend won't start

1. Check database connection:
   ```bash
   psql $DATABASE_URL -c "SELECT NOW()"
   ```

2. Check logs:
   ```bash
   tail -f backend/logs/error.log
   ```

3. Verify environment variables:
   ```bash
   node -e "require('dotenv').config(); console.log(process.env)"
   ```

### Simphony authentication fails

1. Verify credentials in `.env`
2. Check STS API URLs are correct
3. Test authentication separately:
   ```bash
   node -e "const STSAuthClient = require('./src/auth/sts-auth'); const config = require('./src/config'); const client = new STSAuthClient(config.simphony); client.getToken().then(console.log).catch(console.error);"
   ```

### Flutter app can't connect to backend

1. Check API URL in `.env`
2. For Android emulator, use `http://10.0.2.2:3000`
3. For iOS simulator, ensure backend is on `localhost:3000`
4. Verify API key matches backend configuration

### Database migrations fail

1. Check PostgreSQL version (15+ required)
2. Verify database exists:
   ```bash
   psql -l | grep payment_orchestrator
   ```
3. Manually run migration:
   ```bash
   psql payment_orchestrator < backend/db/migrations/001_initial_schema.sql
   ```

---

## Security Considerations

1. **Change default API key** - Never use `dev_api_key_change_in_prod` in production
2. **Use HTTPS** - Always use TLS in production
3. **Secure database** - Use strong passwords, restrict network access
4. **Rotate credentials** - Regularly rotate Simphony API credentials
5. **Monitor logs** - Set up alerts for suspicious activity
6. **Rate limiting** - Implement rate limiting for API endpoints
7. **Input validation** - All inputs are validated, but review for your use case

---

## Support

For issues and questions:
1. Check logs in `backend/logs/`
2. Review database exceptions table
3. Check Simphony STS API status
4. Contact support with payment intent ID for tracking
