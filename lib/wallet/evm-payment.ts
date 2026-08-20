const ERC20_TRANSFER_SELECTOR = "a9059cbb"
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

export interface WalletPaymentConfig {
  chainId: number
  chainName: string
  tokenAddress: `0x${string}`
  destinationAddress: `0x${string}`
  tokenSymbol: string
  tokenDecimals: number
  tokenUsdRate: string
  rpcUrl: string
  confirmations: number
}

export interface WalletPaymentDetails {
  chainId: number
  chainName: string
  tokenAddress: `0x${string}`
  destinationAddress: `0x${string}`
  tokenSymbol: string
  tokenDecimals: number
  amountToken: string
  amountBaseUnits: string
  confirmations: number
  rpcUrl?: string
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

export function decimalToBaseUnits(value: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error("Invalid token decimals")
  }
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Invalid decimal token amount")

  const [whole, fraction = ""] = value.split(".")
  if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) {
    throw new Error("Token amount exceeds token precision")
  }
  const normalizedFraction = fraction.slice(0, decimals).padEnd(decimals, "0")
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(normalizedFraction || "0")).toString()
}

export function baseUnitsToDecimal(value: string, decimals: number): string {
  const base = BigInt(value)
  const divisor = 10n ** BigInt(decimals)
  const whole = base / divisor
  const fraction = (base % divisor).toString().padStart(decimals, "0").replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

export function encodeErc20Transfer(destinationAddress: string, amountBaseUnits: string): string {
  if (!isAddress(destinationAddress)) throw new Error("Invalid ERC-20 destination address")
  const amount = BigInt(amountBaseUnits)
  if (amount <= 0n) throw new Error("ERC-20 transfer amount must be positive")

  const addressWord = destinationAddress.slice(2).toLowerCase().padStart(64, "0")
  const amountWord = amount.toString(16).padStart(64, "0")
  return `0x${ERC20_TRANSFER_SELECTOR}${addressWord}${amountWord}`
}

export function isVerifiedErc20Transfer(
  receipt: {
    status?: string
    logs?: Array<{ address?: string; topics?: string[]; data?: string }>
  },
  expected: {
    tokenAddress: string
    destinationAddress: string
    minimumBaseUnits: string
  },
): boolean {
  if (receipt.status?.toLowerCase() !== "0x1") return false
  if (!isAddress(expected.tokenAddress) || !isAddress(expected.destinationAddress)) return false

  const tokenAddress = expected.tokenAddress.toLowerCase()
  const destinationTopic = expected.destinationAddress.slice(2).toLowerCase().padStart(64, "0")
  const minimum = BigInt(expected.minimumBaseUnits)

  return (receipt.logs || []).some((log) => {
    if (log.address?.toLowerCase() !== tokenAddress) return false
    if (log.topics?.[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) return false
    if (log.topics?.[2]?.slice(-64).toLowerCase() !== destinationTopic) return false
    if (!log.data || !/^0x[0-9a-fA-F]+$/.test(log.data)) return false
    return BigInt(log.data) >= minimum
  })
}

export function getWalletPaymentConfig(env: NodeJS.ProcessEnv = process.env): WalletPaymentConfig | null {
  const chainId = Number(env.WALLET_PAYMENT_CHAIN_ID)
  const tokenAddress = env.WALLET_PAYMENT_TOKEN_ADDRESS || ""
  const destinationAddress = env.WALLET_PAYMENT_DESTINATION_ADDRESS || ""
  const rpcUrl = env.WALLET_PAYMENT_RPC_URL || ""
  const tokenDecimals = Number(env.WALLET_PAYMENT_TOKEN_DECIMALS || 6)
  const tokenUsdRate = env.WALLET_PAYMENT_USD_RATE || ""
  const confirmations = Number(env.WALLET_PAYMENT_CONFIRMATIONS || 3)
  const walletConnectProjectId = env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ""

  if (
    !Number.isInteger(chainId) || chainId <= 0 ||
    !isAddress(tokenAddress) || !isAddress(destinationAddress) ||
    !/^https:\/\//i.test(rpcUrl) ||
    !Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36 ||
    !/^\d+(?:\.\d+)?$/.test(tokenUsdRate) || Number(tokenUsdRate) <= 0 ||
    !Number.isInteger(confirmations) || confirmations < 1 ||
    !walletConnectProjectId
  ) {
    return null
  }

  return {
    chainId,
    chainName: env.WALLET_PAYMENT_CHAIN_NAME || `EVM Chain ${chainId}`,
    tokenAddress: tokenAddress as `0x${string}`,
    destinationAddress: destinationAddress as `0x${string}`,
    tokenSymbol: env.WALLET_PAYMENT_TOKEN_SYMBOL || "USDT",
    tokenDecimals,
    tokenUsdRate,
    rpcUrl,
    confirmations,
  }
}

export { ERC20_TRANSFER_TOPIC }
