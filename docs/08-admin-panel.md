# Admin Panel Guide

The admin panel provides complete control over your faucet platform.

---

## Accessing Admin Panel

1. Navigate to `/admin`
2. Login with an admin account
3. Admin status is determined by the `role` field in the `users` table

### Making a User Admin

\`\`\`sql
UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
\`\`\`

---

## Dashboard Overview

The main admin dashboard displays:

- **Total Users** - Registered accounts
- **Active Users** - Users active in last 24h
- **Total Revenue** - Offerwall earnings
- **Pending Withdrawals** - Awaiting processing
- **System Health** - API status checks
- **Recent Activity** - Latest transactions

---

## User Management

### Viewing Users

- Search by email, username, or ID
- Filter by status (active, banned, unverified)
- Sort by registration date, balance, earnings

### User Actions

| Action | Description |
|--------|-------------|
| View Profile | See complete user details |
| Edit Balance | Manually adjust balance |
| Ban User | Prevent access |
| Unban User | Restore access |
| View Transactions | See all user transactions |
| Reset Password | Send reset email |

---

## Transaction Management

### Transaction Types

| Type | Description |
|------|-------------|
| `offer` | Offerwall completion |
| `withdrawal` | User withdrawal |
| `bonus` | Daily/referral bonus |
| `adjustment` | Admin adjustment |
| `fee` | Platform fees |

### Transaction Actions

- View transaction details
- Reverse fraudulent transactions
- Export transaction reports

---

## Withdrawal Management

### Withdrawal Status

| Status | Description |
|--------|-------------|
| `pending` | Awaiting processing |
| `processing` | Being sent |
| `completed` | Successfully sent |
| `failed` | Send failed |
| `cancelled` | Admin cancelled |

### Processing Withdrawals

1. Review pending withdrawals
2. Check user for fraud flags
3. Approve or reject
4. System sends via FaucetPay
5. Status updates automatically

---

## Fraud Detection

### Fraud Flags

The system automatically flags suspicious activity:

- Multiple accounts (same IP/fingerprint)
- Adblock detected
- VPN/Proxy usage
- Unusual earning patterns
- Bot behavior

### Reviewing Flags

1. Go to **Fraud Alerts**
2. Review flagged users
3. Investigate activity
4. Take action (warn, ban, clear)

---

## System Settings

### Configurable Options

| Setting | Description |
|---------|-------------|
| Faucet Reward | Base claim amount |
| Claim Interval | Time between claims |
| Minimum Withdrawal | Minimum balance to withdraw |
| Referral Bonus | Percentage for referrals |
| Daily Bonus | Daily login reward |

### Ad Settings

Configure ad networks:
- Enable/disable providers
- Set ad positions
- View impression/click stats

---

## Analytics

### Available Reports

- Daily/weekly/monthly earnings
- User registration trends
- Offerwall performance
- Withdrawal statistics
- Geographic distribution

### Exporting Data

Export reports as:
- CSV files
- JSON format
- PDF reports (coming soon)

---

## Audit Logs

All admin actions are logged:

- User modifications
- Setting changes
- Withdrawal approvals
- System changes

Review logs at **Admin** → **Audit Logs**

---

## Best Practices

1. **Regular Review** - Check fraud flags daily
2. **Monitor Health** - Watch system status
3. **Backup Data** - Export important data regularly
4. **Update Settings** - Adjust rewards based on market
5. **Respond Quickly** - Handle support issues promptly

---

## Next Steps

Continue to [Anti-Adblock Security](09-anti-adblock-security.md) to understand the protection system.
