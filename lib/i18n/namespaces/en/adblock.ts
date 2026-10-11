export default {
  title: "Adblock Detected",
  message: "Please disable your ad blocker to continue using this site",
  countdown: "You will be flagged in {{seconds}} seconds",
  disableInstructions: "How to disable your ad blocker:",
  step1: "Click the ad blocker icon in your browser",
  step2: "Select 'Disable' or 'Pause' for this site",
  step3: "Refresh the page",
  whyNeeded: "Why is this needed?",
  explanation:
    "We rely on ads to keep this service free. Disabling your ad blocker helps us continue to provide free Bitcoin.",
  flagged: "You have been flagged for using an ad blocker",
  contactSupport: "Contact support if you believe this is an error",
  // Warning-modal strings (components/adblock/adblock-warning-modal.tsx).
  // Per-blocker instructions intentionally keep product names and literal
  // browser-menu labels untranslated (they are quoted UI text).
  accountFlagged: "Account Flagged",
  flaggedBody:
    "Your account has been flagged for persistent ad-blocker usage. Earnings, withdrawals and bonuses are paused while this flag is active.",
  flaggedAppeal:
    "If this is a mistake — for example a strict browser, VPN or DNS filter — tap \"Appeal This Decision\" below and our team will review your case.",
  detected: "Detected",
  serverVerified: "Server Verified",
  clientDetection: "Client Detection",
  appealTitle: "Appeal This Decision",
  appealProcessing: "Processing appeal...",
  appealAccepted: "Appeal accepted! Refreshing...",
  appealRejected: "Appeal rejected. Please contact support.",
  refreshAfterChanges: "Refresh the page after making changes",
  refreshAfterDisabling: "Refresh the page after disabling",
  disableAllBlockers: "Check for multiple ad blockers - disable all of them",
  routerAdblock: "Check your router settings for ad-blocking features",
  dnsWhitelist: "If using Pi-hole, AdGuard Home, or NextDNS, whitelist this domain",
}
