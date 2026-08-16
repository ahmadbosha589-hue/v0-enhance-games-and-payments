# FAQ & Troubleshooting

Common questions and solutions for the Crypto Faucet Platform.

---

## Frequently Asked Questions

### General

**Q: What currencies are supported?**
A: The platform supports all FaucetPay currencies: BTC, ETH, LTC, DOGE, BCH, DASH, DGB, TRX, USDT, FEY, ZEC, BNB, SOL, XMR, MATIC, ADA, TON.

**Q: Can I customize the design?**
A: Yes, all components use Tailwind CSS and can be customized. The UI is built with shadcn/ui components.

**Q: Is this mobile-friendly?**
A: Yes, the platform is fully responsive and works on all devices.

---

### Setup Issues

**Q: Environment variables not working?**
A: 
1. Ensure `.env.local` exists in root directory
2. Restart the development server
3. Check for typos in variable names
4. Verify values don't have extra spaces

**Q: Database connection failing?**
A:
1. Verify Supabase URL is correct
2. Check anon key is valid
3. Ensure project is active (not paused)
4. Check IP restrictions in Supabase

**Q: Google login not working?**
A:
1. Verify OAuth credentials in Google Console
2. Check redirect URIs match exactly
3. Ensure Google provider enabled in Supabase
4. Check for CORS issues

---

### Authentication Problems

**Q: Users can't register?**
A:
- Check email provider settings in Supabase
- Verify SMTP configuration (if custom)
- Check for rate limiting
- Review auth logs in Supabase

**Q: Password reset not sending?**
A:
- Check email configuration
- Verify user email exists
- Check spam folder
- Review email template

**Q: Sessions expiring too quickly?**
A:
- Check JWT expiry settings in Supabase
- Verify refresh token handling
- Check for clock sync issues

---

### Offerwall Issues

**Q: Postbacks not receiving?**
A:
1. Verify postback URL is accessible publicly
2. Check HTTPS certificate is valid
3. Review server logs for errors
4. Test with provider's test tool
5. Check firewall/security settings

**Q: Credits not appearing?**
A:
1. Check postback secret key
2. Verify user ID format matches
3. Review transaction logs
4. Check for duplicate prevention blocking

**Q: Wrong amount credited?**
A:
1. Check currency conversion settings
2. Verify postback amount parameter
3. Review calculation logic
4. Check for rounding issues

---

### Withdrawal Problems

**Q: Withdrawals failing?**
A:
1. Verify FaucetPay API key
2. Check user's FaucetPay account is linked
3. Ensure minimum withdrawal met
4. Review FaucetPay balance

**Q: Withdrawal stuck in pending?**
A:
1. Check admin approval settings
2. Review fraud flags on user
3. Check FaucetPay API status
4. Review server logs

---

### Admin Panel

**Q: Can't access admin panel?**
A:
1. Verify user has admin role in database
2. Check authentication is working
3. Clear browser cache
4. Check middleware protection

**Q: Settings not saving?**
A:
1. Check database permissions
2. Verify RLS policies
3. Review browser console for errors
4. Check API response

---

### Performance Issues

**Q: Site loading slowly?**
A:
1. Check database query performance
2. Review API response times
3. Enable caching where possible
4. Optimize images and assets
5. Check for N+1 queries

**Q: High database usage?**
A:
1. Add missing indexes
2. Optimize complex queries
3. Implement pagination
4. Use connection pooling

---

### Security Concerns

**Q: Getting many fraud flags?**
A:
1. Review detection thresholds
2. Check for VPN false positives
3. Analyze flagged patterns
4. Adjust sensitivity settings

**Q: Suspected bot attack?**
A:
1. Enable/increase CAPTCHA
2. Review rate limits
3. Check IP patterns
4. Consider temporary restrictions

---

## Error Messages

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid API key` | Wrong credentials | Check .env variables |
| `Rate limited` | Too many requests | Wait and retry |
| `User not found` | Invalid user ID | Verify ID format |
| `Insufficient balance` | Low balance | Check minimums |
| `Invalid signature` | Postback hash mismatch | Verify secret key |

### Database Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Connection refused` | DB unavailable | Check Supabase status |
| `Permission denied` | RLS blocking | Check policies |
| `Duplicate key` | Unique constraint | Handle in code |
| `Foreign key violation` | Invalid reference | Check relationships |

---

## Getting Help

### Self-Help Resources

1. Review this documentation
2. Check error logs in Vercel
3. Check Supabase logs
4. Search for error messages online

### Useful Links

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [FaucetPay API](https://faucetpay.io/api-documentation)

---

## Changelog

### Version 1.0.0
- Initial release
- Full faucet functionality
- 10 offerwall integrations
- Admin dashboard
- Anti-adblock system

---

**Thank you for using Crypto Faucet Platform!**
