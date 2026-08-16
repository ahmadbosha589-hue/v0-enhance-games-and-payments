import type { Metadata } from "next"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PLATFORM_CONFIG } from "@/lib/constants/config"
import { Shield, AlertTriangle, UserCheck, FileSearch, Ban, Scale } from "lucide-react"

export const metadata: Metadata = {
  title: "AML Policy | CryptoFaucet",
  description: "Anti-Money Laundering (AML) policy and compliance information for CryptoFaucet.",
}

const sections = [
  {
    icon: Shield,
    title: "Policy Overview",
    content: `${PLATFORM_CONFIG.name} is committed to preventing money laundering, terrorist financing, and other financial crimes. This Anti-Money Laundering (AML) Policy outlines our procedures and controls to detect, prevent, and report suspicious activities in compliance with applicable laws and regulations.`,
  },
  {
    icon: UserCheck,
    title: "Know Your Customer (KYC)",
    content: `While our basic faucet services do not require identity verification for small amounts, we implement tiered KYC procedures for higher withdrawal limits:
    
    • Tier 1 (Basic): Email verification only - Limited to standard faucet claims
    • Tier 2 (Enhanced): Additional verification may be required for withdrawals exceeding 100,000 satoshis per day
    • Tier 3 (Full KYC): Government ID verification for users requesting higher limits or flagged by our monitoring systems`,
  },
  {
    icon: FileSearch,
    title: "Transaction Monitoring",
    content: `We employ sophisticated monitoring systems to detect suspicious activity:
    
    • Real-time transaction monitoring for unusual patterns
    • IP address and device fingerprint analysis
    • Behavioral analytics to identify account abuse
    • Automated flagging of high-risk transactions
    • Manual review of flagged accounts by our compliance team
    
    Our fraud detection algorithms analyze factors including claim frequency, withdrawal patterns, referral networks, and geographic indicators.`,
  },
  {
    icon: AlertTriangle,
    title: "Suspicious Activity Reporting",
    content: `When suspicious activity is detected, we follow a structured process:
    
    1. Automatic account flagging and potential restriction
    2. Internal investigation by our compliance team
    3. Collection of relevant transaction data and evidence
    4. Filing of Suspicious Activity Reports (SARs) with appropriate authorities when required
    5. Cooperation with law enforcement investigations
    
    We maintain records of all suspicious activity investigations for at least five years.`,
  },
  {
    icon: Ban,
    title: "Prohibited Activities",
    content: `The following activities are strictly prohibited on our platform:
    
    • Creating multiple accounts to circumvent limits
    • Using VPNs or proxies to hide your location
    • Money laundering or attempting to convert illegal proceeds
    • Terrorist financing or support of sanctioned entities
    • Structuring transactions to avoid detection
    • Using automated tools or bots to exploit our services
    • Providing false identity information
    
    Violation of these policies will result in immediate account termination and may be reported to authorities.`,
  },
  {
    icon: Scale,
    title: "Regulatory Compliance",
    content: `We are committed to complying with all applicable anti-money laundering regulations including:
    
    • Bank Secrecy Act (BSA) requirements
    • Financial Action Task Force (FATF) recommendations
    • EU Anti-Money Laundering Directives
    • Local regulations in jurisdictions where we operate
    
    Our compliance program is regularly reviewed and updated to reflect changes in regulatory requirements and industry best practices.`,
  },
]

export default function AMLPolicyPage() {
  return (
    <div className="container max-w-4xl py-16">
      {/* Header */}
      <div className="mb-12 text-center">
        <Badge variant="outline" className="mb-4">
          <Shield className="mr-1 h-3 w-3" />
          Compliance
        </Badge>
        <h1 className="mb-4 text-4xl font-bold tracking-tight">Anti-Money Laundering Policy</h1>
        <p className="text-muted-foreground">Last updated: December 11, 2025</p>
      </div>

      {/* Important Notice */}
      <Card className="mb-8 border-amber-500/50 bg-amber-500/10">
        <CardContent className="flex gap-4 p-6">
          <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
          <div>
            <h3 className="mb-1 font-semibold text-amber-500">Important Notice</h3>
            <p className="text-sm text-muted-foreground">
              This policy applies to all users of {PLATFORM_CONFIG.name}. By using our services, you agree to comply
              with this AML policy and our fraud detection measures. Failure to comply may result in account suspension,
              fund forfeiture, and reporting to relevant authorities.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      <div className="space-y-8">
        {sections.map((section, index) => (
          <section key={section.title}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <section.icon className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                {index + 1}. {section.title}
              </h2>
            </div>
            <div className="pl-[52px]">
              <div className="space-y-4 text-muted-foreground whitespace-pre-line">{section.content}</div>
            </div>
          </section>
        ))}
      </div>

      {/* Employee Training */}
      <section className="mt-12">
        <h2 className="mb-4 text-2xl font-bold">7. Employee Training</h2>
        <div className="space-y-4 text-muted-foreground">
          <p>
            All employees with access to user data or transaction information receive regular AML training covering:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Recognition of suspicious activities and red flags</li>
            <li>Reporting procedures and escalation protocols</li>
            <li>Record keeping requirements</li>
            <li>Customer due diligence procedures</li>
            <li>Updates to AML regulations and best practices</li>
          </ul>
          <p>Training is conducted annually and whenever significant regulatory changes occur.</p>
        </div>
      </section>

      {/* Record Keeping */}
      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">8. Record Keeping</h2>
        <div className="space-y-4 text-muted-foreground">
          <p>We maintain comprehensive records of:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>User identification and verification documents</li>
            <li>Transaction history and withdrawal records</li>
            <li>Suspicious activity reports and investigation files</li>
            <li>AML compliance training records</li>
            <li>Policy documents and updates</li>
          </ul>
          <p>
            Records are retained for a minimum of five years from the date of the transaction or the end of the business
            relationship, whichever is later, unless a longer retention period is required by law.
          </p>
        </div>
      </section>

      {/* Designated Compliance Officer */}
      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">9. Compliance Officer</h2>
        <p className="text-muted-foreground">
          Our designated AML Compliance Officer is responsible for overseeing the implementation and effectiveness of
          this policy, including regular audits, employee training, and coordination with regulatory authorities. For
          compliance-related inquiries, please contact our compliance team at{" "}
          <a
            href={`mailto:compliance@${PLATFORM_CONFIG.name.toLowerCase().replace(/\s/g, "")}.com`}
            className="text-primary hover:underline"
          >
            compliance@cryptofaucet.com
          </a>
        </p>
      </section>

      {/* Policy Updates */}
      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">10. Policy Updates</h2>
        <p className="text-muted-foreground">
          This AML Policy is reviewed and updated at least annually, or more frequently if required by changes in
          applicable laws, regulations, or our business operations. Users will be notified of material changes through
          our website or by email.
        </p>
      </section>

      {/* Contact */}
      <Card className="mt-12 border-border/50">
        <CardContent className="p-6">
          <h3 className="mb-4 text-lg font-semibold">Questions or Concerns?</h3>
          <p className="text-muted-foreground">
            If you have any questions about this AML Policy or wish to report suspicious activity, please contact us at{" "}
            <a href={`mailto:${PLATFORM_CONFIG.supportEmail}`} className="text-primary hover:underline">
              {PLATFORM_CONFIG.supportEmail}
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
