import type { Metadata } from "next"
import { PLATFORM_CONFIG } from "@/lib/constants/config"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy Policy for ${PLATFORM_CONFIG.name}`,
}

export default function PrivacyPage() {
  return (
    <div className="container max-w-4xl py-16">
      <h1 className="mb-8 text-4xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mb-8 text-muted-foreground">Last updated: December 11, 2025</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-semibold">1. Introduction</h2>
          <p className="text-muted-foreground">
            {PLATFORM_CONFIG.name} (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your
            privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you
            use our cryptocurrency faucet service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">2. Information We Collect</h2>
          <h3 className="mt-4 text-xl font-medium">2.1 Personal Information</h3>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>Email address (required for account creation)</li>
            <li>Username and display name (optional)</li>
            <li>FaucetPay email address (for withdrawals)</li>
          </ul>

          <h3 className="mt-4 text-xl font-medium">2.2 Automatically Collected Information</h3>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>IP addresses</li>
            <li>Device fingerprints and browser information</li>
            <li>Usage data (claims, transactions, login times)</li>
            <li>Cookies and similar tracking technologies</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">3. How We Use Your Information</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>To provide and maintain our Service</li>
            <li>To process your claims and withdrawals</li>
            <li>To prevent fraud and abuse</li>
            <li>To communicate with you about your account</li>
            <li>To improve our Service and user experience</li>
            <li>To comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">4. Fraud Prevention</h2>
          <p className="text-muted-foreground">
            We collect and analyze IP addresses, device fingerprints, and behavioral patterns to detect and prevent
            fraudulent activity. This data is used to protect our Service and legitimate users from abuse.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">5. Data Sharing</h2>
          <p className="mb-4 text-muted-foreground">We may share your information with:</p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>FaucetPay (to process withdrawals)</li>
            <li>Service providers (hosting, analytics, security)</li>
            <li>Law enforcement (when required by law)</li>
          </ul>
          <p className="mt-4 text-muted-foreground">We do not sell your personal information to third parties.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">6. Data Security</h2>
          <p className="text-muted-foreground">
            We implement appropriate technical and organizational measures to protect your personal information,
            including encryption, secure servers, and regular security audits. However, no method of transmission over
            the Internet is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">7. Data Retention</h2>
          <p className="text-muted-foreground">
            We retain your personal information for as long as your account is active or as needed to provide our
            services. We may retain certain information for longer periods for legal, accounting, or fraud prevention
            purposes.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">8. Your Rights</h2>
          <p className="mb-4 text-muted-foreground">You have the right to:</p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>Access your personal information</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your account</li>
            <li>Export your data</li>
            <li>Opt out of marketing communications</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">9. Cookies</h2>
          <p className="text-muted-foreground">
            We use cookies and similar technologies to maintain your session, remember your preferences, and analyze
            Service usage. You can control cookies through your browser settings or through our{" "}
            <a href="/cookies" className="text-primary hover:underline">
              Cookie Preferences
            </a>{" "}
            page.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">10. Advertising &amp; Third-Party Vendors</h2>
          <p className="mb-4 text-muted-foreground">
            Our current advertising-partner registry is the source of truth for publisher-network status. Every network
            currently marked as unverified is disabled, and no Google AdSense publisher integration is active. See our{" "}
            <a href="/advertising-partners" className="text-primary hover:underline">
              Advertising Partners Disclosure
            </a>{" "}
            for the current registry-backed list.
          </p>
          <p className="text-muted-foreground">
            Optional marketing technology is gated behind an explicit choice in our{" "}
            <a href="/cookies" className="text-primary hover:underline">
              Cookie Preferences
            </a>{" "}
            tool. That consent choice does not enable a network that is disabled in the registry.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">11. Your Privacy Rights (GDPR / CCPA)</h2>
          <p className="mb-4 text-muted-foreground">
            Depending on where you live, you may have additional rights over your personal information:
          </p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              <strong>EEA/UK residents (GDPR):</strong> you have the right to access, rectify, erase, restrict, or
              object to our processing of your personal data, and the right to data portability and to withdraw
              consent at any time. You may also lodge a complaint with your local data protection authority.
            </li>
            <li>
              <strong>California residents (CCPA/CPRA):</strong> you have the right to know what personal
              information we collect, to request deletion, and to opt out of the &quot;sale&quot; or
              &quot;sharing&quot; of personal information for cross-context behavioral advertising. We do not sell
              personal information for money; disabling Marketing cookies in our{" "}
              <a href="/cookies" className="text-primary hover:underline">
                Cookie Preferences
              </a>{" "}
              tool opts you out of interest-based advertising sharing.
            </li>
            <li>To exercise any of these rights, contact us using the details in Section 12 below.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">12. Children&apos;s Privacy</h2>
          <p className="text-muted-foreground">
            Our Service is not intended for individuals under 18 years of age. We do not knowingly collect personal
            information from children.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">13. Changes to This Policy</h2>
          <p className="text-muted-foreground">
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
            policy on this page and updating the &quot;Last updated&quot; date.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold">14. Contact Us</h2>
          <p className="text-muted-foreground">
            If you have questions about this Privacy Policy, please contact us at{" "}
            <a href={`mailto:${PLATFORM_CONFIG.supportEmail}`} className="text-primary hover:underline">
              {PLATFORM_CONFIG.supportEmail}
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
