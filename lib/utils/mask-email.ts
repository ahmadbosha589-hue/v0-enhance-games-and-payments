/**
 * Masks an email address for privacy
 * Example: "john.doe@example.com" -> "jo***@***.com"
 *
 * @param email - The email address to mask
 * @param showFull - If true, shows the full email (for the user viewing their own email or admin)
 * @returns Masked email string or full email if showFull is true
 */
export function maskEmail(email: string | null | undefined, showFull = false): string {
  if (!email) return "***@***.***"

  // If showFull is true, return the full email (for own email or admin viewing)
  if (showFull) {
    return email
  }

  const [localPart, domain] = email.split("@")

  if (!domain) return "***@***.***"

  const [domainName, ...tldParts] = domain.split(".")
  const tld = tldParts.join(".")

  // Strict masking for others: "john.doe@example.com" -> "jo***@***.com"
  const maskedLocal = localPart.length <= 2 ? localPart[0] + "***" : localPart.slice(0, 2) + "***"

  return `${maskedLocal}@***.${tld}`
}

/**
 * Checks if the email belongs to the current user
 * Used to determine masking level
 */
export function isOwnEmail(email: string | null | undefined, currentUserEmail: string | null | undefined): boolean {
  if (!email || !currentUserEmail) return false
  return email.toLowerCase() === currentUserEmail.toLowerCase()
}
