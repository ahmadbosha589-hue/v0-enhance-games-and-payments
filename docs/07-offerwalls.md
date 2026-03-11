# Offerwall Integration

This platform supports 10+ offerwall providers for user earnings.

---

## How Offerwalls Work

\`\`\`
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│   User   │────▶│   Offerwall  │────▶│   Complete   │
│          │     │   Provider   │     │    Offer     │
└──────────┘     └──────────────┘     └──────────────┘
                                              │
                                              ▼
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Balance │◀────│   Your API   │◀────│   Postback   │
│ Updated  │     │   Endpoint   │     │   Received   │
└──────────┘     └──────────────┘     └──────────────┘
\`\`\`

1. User clicks offerwall link
2. User completes offer on provider site
3. Provider sends postback to your server
4. Your server verifies and credits user

---

## Integrated Providers

| Provider | Offer Types | Payout |
|----------|-------------|--------|
| Torox | Surveys, Apps, Tasks | High |
| CPX Research | Surveys | Medium-High |
| Lootably | Surveys, Videos | Medium |
| AdGate Media | Offers, Surveys | Medium-High |
| Ayet Studios | Mobile Apps | High |
| Monlix | Mixed Offers | Medium |
| Hideout.TV | Videos | Low-Medium |
| BitLabs | Surveys | Medium-High |
| Timewall | Time-based | Low |

---

## General Setup Steps

For each offerwall:

1. **Create Account** - Sign up at provider website
2. **Create App/Placement** - Set up your faucet
3. **Get Credentials** - API key, secret key, app ID
4. **Configure Postback** - Set your callback URL
5. **Add to Environment** - Add keys to `.env.local`
6. **Test Integration** - Use provider's test tools

---

## Postback URL Format

Your postback URLs follow this pattern:

\`\`\`
https://your-domain.com/api/offerwalls/[provider]/postback
\`\`\`

Example URLs:
\`\`\`
https://your-domain.com/api/offerwalls/torox/postback
https://your-domain.com/api/offerwalls/cpx/postback
https://your-domain.com/api/offerwalls/lootably/postback
\`\`\`

---

## Provider-Specific Setup

### Torox

1. Sign up at [torox.io](https://torox.io)
2. Create new placement
3. Set postback URL:
   \`\`\`
   https://your-domain.com/api/offerwalls/torox/postback?user_id={user_id}&amount={payout}&sig={sig}
   \`\`\`
4. Copy secret key to `TOROX_SECRET_KEY`

### CPX Research

1. Sign up at [cpx.to](https://cpx.to)
2. Create new survey wall
3. Set postback URL:
   \`\`\`
   https://your-domain.com/api/offerwalls/cpx/postback?user_id={user_id}&amount={payout}&trans_id={trans_id}&hash={hash}
   \`\`\`
4. Copy credentials:
   - App ID → `CPX_APP_ID`
   - Secret → `CPX_SECRET_KEY`

### Lootably

1. Sign up at [lootably.com](https://lootably.com)
2. Create placement
3. Set postback URL:
   \`\`\`
   https://your-domain.com/api/offerwalls/lootably/postback
   \`\`\`
4. Copy secret to `LOOTABLY_SECRET_KEY`

### AdGate Media

1. Sign up at [adgatemedia.com](https://adgatemedia.com)
2. Create wall
3. Set postback URL with your parameters
4. Copy secret to `ADGATE_SECRET_KEY`

### BitLabs

1. Sign up at [bitlabs.ai](https://bitlabs.ai)
2. Create app
3. Configure S2S postback:
   \`\`\`
   https://your-domain.com/api/offerwalls/bitlabs/postback
   \`\`\`
4. Copy secret to `BITLABS_SECRET_KEY`

---

## Postback Security

All postbacks are verified server-side:

1. **Signature Verification** - Hash validation with secret key
2. **Duplicate Prevention** - Transaction ID checking
3. **Amount Validation** - Reasonable limits enforced
4. **IP Whitelist** - Optional provider IP verification

---

## Testing Postbacks

Most providers offer test tools:

1. Find "Test Postback" in provider dashboard
2. Enter a test user ID
3. Send test postback
4. Verify credit in your database
5. Check logs for any errors

---

## Troubleshooting

### Postbacks not received
- Verify URL is correct and accessible
- Check firewall/security settings
- Verify HTTPS certificate is valid

### Invalid signature errors
- Double-check secret key
- Ensure URL parameters match expected format
- Check for URL encoding issues

### Credits not appearing
- Check database connection
- Verify user ID exists
- Review server logs for errors

---

## Next Steps

Continue to [Admin Panel](08-admin-panel.md) to learn about management features.
