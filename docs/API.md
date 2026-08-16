# API Documentation

## Authentication

All authenticated endpoints require a valid session cookie set by Supabase Auth.

## Endpoints

### POST /api/claim

Submit a faucet claim.

**Request Body:**
\`\`\`json
{
  "fingerprint": {
    "visitorId": "string",
    "browserName": "string",
    "osName": "string"
  }
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "claim": {
    "id": "uuid",
    "amount": 150,
    "streak": 5,
    "level": 3
  },
  "balance": 15000,
  "nextClaimAt": "2024-01-01T12:05:00Z"
}
\`\`\`

**Error Codes:**
- 401: Unauthorized
- 403: Account banned/suspended
- 429: Cooldown active or rate limited

---

### POST /api/withdraw

Request a withdrawal.

**Request Body:**
\`\`\`json
{
  "amount": 10000,
  "currency": "BTC"
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "withdrawal": {
    "id": "uuid",
    "amount": 10000,
    "fee": 100,
    "netAmount": 9900,
    "currency": "BTC",
    "status": "pending"
  },
  "balance": 5000
}
\`\`\`

**Supported Currencies:**
BTC, LTC, DOGE, ETH, BCH, DASH, DGB, TRX, USDT, FEY, ZEC, BNB, SOL, XRP, MATIC, TON

---

### GET /api/leaderboard

Get platform leaderboard.

**Query Parameters:**
- `type`: earnings | claims | referrals | streak (default: earnings)
- `period`: all | today | week (default: all)
- `limit`: 1-100 (default: 50)

**Response:**
\`\`\`json
{
  "leaderboard": [
    {
      "rank": 1,
      "username": "user123",
      "totalEarned": 500000,
      "totalClaims": 1000,
      "level": 10,
      "streak": 30
    }
  ],
  "userRank": {
    "rank": 42,
    "username": "you",
    "totalEarned": 15000
  }
}
\`\`\`

---

### GET /api/health

Health check endpoint for monitoring.

**Response:**
\`\`\`json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "1.0.0",
  "checks": {
    "database": { "status": "healthy", "latency": 15 },
    "auth": { "status": "healthy" }
  },
  "uptime": 86400
}
\`\`\`

---

### GET /api/metrics

Prometheus-compatible metrics endpoint.

**Headers:**
- `Authorization: Bearer {METRICS_API_KEY}`

**Response:** Plain text in Prometheus format
