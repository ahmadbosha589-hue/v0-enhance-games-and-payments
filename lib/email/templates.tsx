// =====================================================
// Email Templates
// =====================================================

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

export function getVerificationEmailTemplate(verificationUrl: string): EmailTemplate {
  return {
    subject: "Verify your Faucero email",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="text-align: center; padding-bottom: 30px;">
        <h1 style="color: #00d4ff; font-size: 28px; margin: 0;">Faucero</h1>
      </td>
    </tr>
    <tr>
      <td style="background-color: #16161a; border-radius: 12px; padding: 40px;">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px;">Verify your email address</h2>
        <p style="color: #a0a0a0; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
          Thanks for signing up for Faucero! Please click the button below to verify your email address and start earning free Bitcoin.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align: center;">
              <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #00d4ff, #00ff88); color: #0a0a0f; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                Verify Email
              </a>
            </td>
          </tr>
        </table>
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding-top: 30px;">
        <p style="color: #666666; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} Faucero. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    text: `
Verify your email address

Thanks for signing up for Faucero! Please click the link below to verify your email address and start earning free Bitcoin.

${verificationUrl}

If you didn't create an account, you can safely ignore this email.

© ${new Date().getFullYear()} Faucero. All rights reserved.
    `.trim(),
  }
}

export function getPasswordResetEmailTemplate(resetUrl: string): EmailTemplate {
  return {
    subject: "Reset your Faucero password",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="text-align: center; padding-bottom: 30px;">
        <h1 style="color: #00d4ff; font-size: 28px; margin: 0;">Faucero</h1>
      </td>
    </tr>
    <tr>
      <td style="background-color: #16161a; border-radius: 12px; padding: 40px;">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px;">Reset your password</h2>
        <p style="color: #a0a0a0; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
          We received a request to reset your password. Click the button below to create a new password.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align: center;">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #00d4ff, #00ff88); color: #0a0a0f; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                Reset Password
              </a>
            </td>
          </tr>
        </table>
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0;">
          This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding-top: 30px;">
        <p style="color: #666666; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} Faucero. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    text: `
Reset your password

We received a request to reset your password. Click the link below to create a new password.

${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.

© ${new Date().getFullYear()} Faucero. All rights reserved.
    `.trim(),
  }
}

export function getWithdrawalNotificationTemplate(
  amount: number,
  status: "pending" | "completed" | "rejected",
  txId?: string,
): EmailTemplate {
  const statusMessages = {
    pending: "Your withdrawal request is being processed",
    completed: "Your withdrawal has been completed",
    rejected: "Your withdrawal request was rejected",
  }

  const statusColors = {
    pending: "#f59e0b",
    completed: "#10b981",
    rejected: "#ef4444",
  }

  return {
    subject: `Withdrawal ${status}: ${amount.toLocaleString()} satoshis`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Withdrawal ${status}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="text-align: center; padding-bottom: 30px;">
        <h1 style="color: #00d4ff; font-size: 28px; margin: 0;">Faucero</h1>
      </td>
    </tr>
    <tr>
      <td style="background-color: #16161a; border-radius: 12px; padding: 40px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <span style="display: inline-block; background-color: ${statusColors[status]}20; color: ${statusColors[status]}; font-size: 14px; font-weight: 600; padding: 8px 16px; border-radius: 20px; text-transform: uppercase;">
            ${status}
          </span>
        </div>
        <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px; text-align: center;">
          ${statusMessages[status]}
        </h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #2a2a2e;">
              <span style="color: #a0a0a0; font-size: 14px;">Amount</span>
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #2a2a2e; text-align: right;">
              <span style="color: #ffffff; font-size: 14px; font-weight: 600;">${amount.toLocaleString()} satoshis</span>
            </td>
          </tr>
          ${
            txId
              ? `
          <tr>
            <td style="padding: 12px 0;">
              <span style="color: #a0a0a0; font-size: 14px;">Transaction ID</span>
            </td>
            <td style="padding: 12px 0; text-align: right;">
              <span style="color: #00d4ff; font-size: 14px; font-family: monospace;">${txId}</span>
            </td>
          </tr>
          `
              : ""
          }
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align: center;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/withdrawals" style="display: inline-block; background: linear-gradient(135deg, #00d4ff, #00ff88); color: #0a0a0f; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                View Details
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding-top: 30px;">
        <p style="color: #666666; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} Faucero. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    text: `
Withdrawal ${status}

${statusMessages[status]}

Amount: ${amount.toLocaleString()} satoshis
${txId ? `Transaction ID: ${txId}` : ""}

View details: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/withdrawals

© ${new Date().getFullYear()} Faucero. All rights reserved.
    `.trim(),
  }
}

export function getNewsletterWelcomeTemplate(unsubscribeUrl: string): EmailTemplate {
  return {
    subject: "Welcome to the Faucero Newsletter!",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Faucero Newsletter</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="text-align: center; padding-bottom: 30px;">
        <h1 style="color: #00d4ff; font-size: 28px; margin: 0;">Faucero</h1>
      </td>
    </tr>
    <tr>
      <td style="background-color: #16161a; border-radius: 12px; padding: 40px;">
        <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px;">Welcome to our Newsletter!</h2>
        <p style="color: #a0a0a0; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
          Thanks for subscribing to the Faucero newsletter! You'll be the first to know about:
        </p>
        <ul style="color: #a0a0a0; font-size: 16px; line-height: 1.8; margin: 0 0 30px; padding-left: 20px;">
          <li style="margin-bottom: 8px;">New features and platform updates</li>
          <li style="margin-bottom: 8px;">Tips to maximize your Bitcoin earnings</li>
          <li style="margin-bottom: 8px;">Exclusive bonus opportunities</li>
          <li style="margin-bottom: 8px;">Cryptocurrency market insights</li>
        </ul>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align: center;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://faucero.com'}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #00d4ff, #00ff88); color: #0a0a0f; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                Start Earning Now
              </a>
            </td>
          </tr>
        </table>
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0; text-align: center;">
          Don't want to receive these emails? <a href="${unsubscribeUrl}" style="color: #00d4ff; text-decoration: none;">Unsubscribe</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding-top: 30px;">
        <p style="color: #666666; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} Faucero. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    text: `
Welcome to the Faucero Newsletter!

Thanks for subscribing to the Faucero newsletter! You'll be the first to know about:

- New features and platform updates
- Tips to maximize your Bitcoin earnings
- Exclusive bonus opportunities
- Cryptocurrency market insights

Start earning now: ${process.env.NEXT_PUBLIC_APP_URL || 'https://faucero.com'}/dashboard

Don't want to receive these emails? Unsubscribe: ${unsubscribeUrl}

© ${new Date().getFullYear()} Faucero. All rights reserved.
    `.trim(),
  }
}
