import type { Metadata } from "next"
import { PLATFORM_CONFIG } from "@/lib/constants/config"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Terms of Service for ${PLATFORM_CONFIG.name}`,
}

export default function TermsPage() {
  return (
    <div className="container max-w-4xl py-16">
      <h1 className="mb-8 text-4xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mb-8 text-muted-foreground">Last updated: December 11, 2025</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
          <p className="text-muted-foreground">
            By accessing and using {PLATFORM_CONFIG.name} (&quot;the Service&quot;), you accept and agree to be bound by
            the terms and provisions of this agreement. If you do not agree to these terms, please do not use our
            Service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">2. Eligibility</h2>
          <p className="text-muted-foreground">
            You must be at least 18 years of age to use this Service. By using the Service, you represent and warrant
            that you are at least 18 years old and have the legal capacity to enter into this agreement.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">3. Account Registration</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>You must provide accurate and complete information when creating an account</li>
            <li>You are responsible for maintaining the security of your account credentials</li>
            <li>One account per person is allowed; multiple accounts will be terminated</li>
            <li>You are responsible for all activities that occur under your account</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">4. Prohibited Activities</h2>
          <p className="mb-4 text-muted-foreground">You agree not to engage in any of the following activities:</p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>Creating multiple accounts to abuse the faucet system</li>
            <li>Using VPNs, proxies, or other tools to circumvent our fraud detection</li>
            <li>Automated claiming using bots, scripts, or other automated means</li>
            <li>Attempting to exploit bugs or vulnerabilities in the system</li>
            <li>Engaging in any form of fraud or deceptive practices</li>
            <li>Harassment or abuse of other users or staff</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">5. Faucet Claims</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>Claim amounts and cooldown periods are subject to change without notice</li>
            <li>We reserve the right to adjust, suspend, or terminate claims at any time</li>
            <li>Streak bonuses are calculated based on consecutive daily claims</li>
            <li>Claims may be withheld pending fraud review</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">6. Referral Program</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>Referral commissions are earned on legitimate claims by referred users</li>
            <li>Self-referrals and fake referrals are strictly prohibited</li>
            <li>We reserve the right to revoke referral earnings obtained through abuse</li>
            <li>Commission rates may be adjusted at any time</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">7. Withdrawals</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>Minimum withdrawal amounts apply and may change</li>
            <li>Withdrawals are processed through FaucetPay</li>
            <li>Processing times may vary based on network conditions</li>
            <li>Suspicious withdrawals may be held for review</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">8. Account Termination</h2>
          <p className="text-muted-foreground">
            We reserve the right to suspend or terminate your account at any time for violations of these terms, fraud,
            or any other reason at our sole discretion. Upon termination, any remaining balance may be forfeited.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">9. Limitation of Liability</h2>
          <p className="text-muted-foreground">
            The Service is provided &quot;as is&quot; without warranties of any kind. We are not liable for any
            indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">10. Changes to Terms</h2>
          <p className="text-muted-foreground">
            We reserve the right to modify these terms at any time. Continued use of the Service after changes
            constitutes acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">11. Contact</h2>
          <p className="text-muted-foreground">
            For questions about these Terms of Service, please contact us at{" "}
            <a href={`mailto:${PLATFORM_CONFIG.supportEmail}`} className="text-primary hover:underline">
              {PLATFORM_CONFIG.supportEmail}
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
