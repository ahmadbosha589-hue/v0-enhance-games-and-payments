import type { WalletPaymentDetails } from "@/lib/wallet/evm-payment"
import { encodeErc20Transfer } from "@/lib/wallet/evm-payment"

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

function chainIdHex(chainId: number): string {
  return `0x${chainId.toString(16)}`
}

async function getProvider(payment: WalletPaymentDetails): Promise<Eip1193Provider> {
  if (typeof window === "undefined") throw new Error("Wallet payments require a browser")
  if (window.ethereum) return window.ethereum

  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
  if (!projectId) {
    throw new Error("Install a browser wallet or configure a WalletConnect project ID")
  }
  if (!payment.rpcUrl) throw new Error("WalletConnect RPC configuration is missing")

  const { EthereumProvider } = await import("@walletconnect/ethereum-provider")
  const provider = await EthereumProvider.init({
    projectId,
    chains: [payment.chainId],
    showQrModal: true,
    rpcMap: { [payment.chainId]: payment.rpcUrl },
  })
  await provider.connect()
  return provider as unknown as Eip1193Provider
}

export async function sendErc20Payment(payment: WalletPaymentDetails): Promise<string> {
  const provider = await getProvider(payment)
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[]
  const from = accounts?.[0]
  if (!from || !/^0x[a-fA-F0-9]{40}$/.test(from)) throw new Error("Wallet did not return a valid account")

  const expectedChain = chainIdHex(payment.chainId)
  const currentChain = String(await provider.request({ method: "eth_chainId" })).toLowerCase()
  if (currentChain !== expectedChain.toLowerCase()) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: expectedChain }] })
    } catch {
      throw new Error(`Switch your wallet to ${payment.chainName} before paying`)
    }
  }

  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{
      from,
      to: payment.tokenAddress,
      data: encodeErc20Transfer(payment.destinationAddress, payment.amountBaseUnits),
      value: "0x0",
    }],
  })

  if (typeof hash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    throw new Error("Wallet did not return a valid transaction hash")
  }
  return hash
}
