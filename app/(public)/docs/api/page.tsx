import type { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Code, Key, Shield, Zap, Book, AlertCircle, CheckCircle, Copy, ExternalLink } from "lucide-react"

export const metadata: Metadata = {
  title: "API Documentation | CryptoFaucet",
  description: "Complete API documentation for CryptoFaucet developers and integrators.",
}

const endpoints = [
  {
    method: "GET",
    path: "/api/profile",
    description: "Get current user profile and balance",
    auth: true,
    rateLimit: "60/min",
  },
  {
    method: "POST",
    path: "/api/claim",
    description: "Make a faucet claim",
    auth: true,
    rateLimit: "12/hour",
  },
  {
    method: "GET",
    path: "/api/claim/status",
    description: "Check claim eligibility and cooldown",
    auth: true,
    rateLimit: "120/min",
  },
  {
    method: "POST",
    path: "/api/withdraw",
    description: "Request a withdrawal to FaucetPay",
    auth: true,
    rateLimit: "10/day",
  },
  {
    method: "GET",
    path: "/api/referrals",
    description: "Get referral stats and earnings",
    auth: true,
    rateLimit: "60/min",
  },
  {
    method: "GET",
    path: "/api/leaderboard",
    description: "Get top earners leaderboard",
    auth: false,
    rateLimit: "30/min",
  },
  {
    method: "GET",
    path: "/api/stats",
    description: "Get platform statistics",
    auth: false,
    rateLimit: "30/min",
  },
  {
    method: "GET",
    path: "/api/health",
    description: "Health check endpoint",
    auth: false,
    rateLimit: "unlimited",
  },
]

const codeExamples = {
  javascript: `// Example: Making a claim
const response = await fetch('https://api.cryptofaucet.com/api/claim', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_ACCESS_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fingerprint: 'device_fingerprint_hash',
  }),
});

const data = await response.json();
console.log(data);
// { success: true, amount: 25, newBalance: 12500, nextClaim: "2025-12-11T20:45:00Z" }`,
  python: `# Example: Making a claim
import requests

response = requests.post(
    'https://api.cryptofaucet.com/api/claim',
    headers={
        'Authorization': 'Bearer YOUR_ACCESS_TOKEN',
        'Content-Type': 'application/json',
    },
    json={
        'fingerprint': 'device_fingerprint_hash',
    }
)

data = response.json()
print(data)
# { "success": True, "amount": 25, "newBalance": 12500, "nextClaim": "2025-12-11T20:45:00Z" }`,
  curl: `# Example: Making a claim
curl -X POST https://api.cryptofaucet.com/api/claim \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"fingerprint": "device_fingerprint_hash"}'

# Response:
# { "success": true, "amount": 25, "newBalance": 12500, "nextClaim": "2025-12-11T20:45:00Z" }`,
}

const errorCodes = [
  { code: 400, name: "Bad Request", description: "Invalid request parameters" },
  { code: 401, name: "Unauthorized", description: "Missing or invalid authentication" },
  { code: 403, name: "Forbidden", description: "Account suspended or action not allowed" },
  { code: 404, name: "Not Found", description: "Resource not found" },
  { code: 429, name: "Too Many Requests", description: "Rate limit exceeded" },
  { code: 500, name: "Internal Server Error", description: "Server error, please try again" },
]

export default function APIDocsPage() {
  return (
    <div className="container py-16">
      <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-4">
            <h3 className="font-semibold">Documentation</h3>
            <nav className="space-y-1 text-sm">
              <a
                href="#overview"
                className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Overview
              </a>
              <a
                href="#authentication"
                className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Authentication
              </a>
              <a
                href="#rate-limits"
                className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Rate Limits
              </a>
              <a
                href="#endpoints"
                className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Endpoints
              </a>
              <a
                href="#errors"
                className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Error Handling
              </a>
              <a
                href="#examples"
                className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Code Examples
              </a>
            </nav>

            <div className="pt-4">
              <h3 className="font-semibold">Resources</h3>
              <nav className="mt-2 space-y-1 text-sm">
                <Link
                  href="/help"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Book className="h-4 w-4" />
                  Help Center
                </Link>
                <Link
                  href="/status"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Zap className="h-4 w-4" />
                  API Status
                </Link>
              </nav>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="min-w-0">
          {/* Header */}
          <div className="mb-12">
            <Badge variant="outline" className="mb-4">
              <Code className="mr-1 h-3 w-3" />
              API v1.0
            </Badge>
            <h1 className="mb-4 text-4xl font-bold tracking-tight">API Documentation</h1>
            <p className="text-lg text-muted-foreground">
              Integrate CryptoFaucet into your applications with our RESTful API. Build custom clients, automate
              workflows, and more.
            </p>
          </div>

          {/* Overview */}
          <section id="overview" className="mb-12 scroll-mt-8">
            <h2 className="mb-4 text-2xl font-bold">Overview</h2>
            <Card className="border-border/50">
              <CardContent className="p-6">
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    The CryptoFaucet API is organized around REST principles. Our API has predictable resource-oriented
                    URLs, accepts JSON-encoded request bodies, returns JSON-encoded responses, and uses standard HTTP
                    response codes.
                  </p>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="mb-2 font-medium text-foreground">Base URL</h4>
                    <code className="text-sm text-primary">https://api.cryptofaucet.com</code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Authentication */}
          <section id="authentication" className="mb-12 scroll-mt-8">
            <h2 className="mb-4 text-2xl font-bold">Authentication</h2>
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" />
                  Bearer Token Authentication
                </CardTitle>
                <CardDescription>All authenticated requests require a valid access token</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Include your access token in the <code className="rounded bg-muted px-1.5 py-0.5">Authorization</code>{" "}
                  header:
                </p>
                <div className="rounded-lg bg-zinc-950 p-4">
                  <pre className="text-sm text-zinc-100">
                    <code>Authorization: Bearer YOUR_ACCESS_TOKEN</code>
                  </pre>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-sm text-muted-foreground">
                    Keep your access tokens secure. Never share them in public repositories or client-side code.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Rate Limits */}
          <section id="rate-limits" className="mb-12 scroll-mt-8">
            <h2 className="mb-4 text-2xl font-bold">Rate Limits</h2>
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Rate Limiting
                </CardTitle>
                <CardDescription>API requests are rate limited to ensure fair usage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Rate limit information is included in response headers:</p>
                <div className="rounded-lg bg-zinc-950 p-4">
                  <pre className="text-sm text-zinc-100">
                    {`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1702324800`}
                  </pre>
                </div>
                <p className="text-sm text-muted-foreground">
                  If you exceed the rate limit, you'll receive a{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">429 Too Many Requests</code> response.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Endpoints */}
          <section id="endpoints" className="mb-12 scroll-mt-8">
            <h2 className="mb-4 text-2xl font-bold">Endpoints</h2>
            <div className="space-y-4">
              {endpoints.map((endpoint) => (
                <Card key={`${endpoint.method}-${endpoint.path}`} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant={endpoint.method === "GET" ? "secondary" : "default"} className="font-mono">
                          {endpoint.method}
                        </Badge>
                        <code className="text-sm">{endpoint.path}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        {endpoint.auth ? (
                          <Badge variant="outline" className="border-primary/50 text-primary">
                            <Key className="mr-1 h-3 w-3" />
                            Auth Required
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/50 text-emerald-500">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Public
                          </Badge>
                        )}
                        <Badge variant="outline">{endpoint.rateLimit}</Badge>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{endpoint.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Error Handling */}
          <section id="errors" className="mb-12 scroll-mt-8">
            <h2 className="mb-4 text-2xl font-bold">Error Handling</h2>
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>HTTP Status Codes</CardTitle>
                <CardDescription>
                  The API uses conventional HTTP response codes to indicate success or failure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {errorCodes.map((error) => (
                    <div
                      key={error.code}
                      className="flex items-center justify-between border-b border-border/50 py-2 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={error.code >= 500 ? "destructive" : error.code >= 400 ? "secondary" : "default"}
                        >
                          {error.code}
                        </Badge>
                        <span className="font-medium">{error.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{error.description}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Code Examples */}
          <section id="examples" className="mb-12 scroll-mt-8">
            <h2 className="mb-4 text-2xl font-bold">Code Examples</h2>
            <Card className="border-border/50">
              <CardContent className="p-0">
                <Tabs defaultValue="javascript" className="w-full">
                  <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
                    <TabsTrigger
                      value="javascript"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                    >
                      JavaScript
                    </TabsTrigger>
                    <TabsTrigger
                      value="python"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                    >
                      Python
                    </TabsTrigger>
                    <TabsTrigger
                      value="curl"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                    >
                      cURL
                    </TabsTrigger>
                  </TabsList>
                  {Object.entries(codeExamples).map(([lang, code]) => (
                    <TabsContent key={lang} value={lang} className="m-0">
                      <div className="relative">
                        <Button variant="ghost" size="icon" className="absolute right-2 top-2 h-8 w-8">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <div className="rounded-b-lg bg-zinc-950 p-4">
                          <pre className="overflow-x-auto text-sm text-zinc-100">
                            <code>{code}</code>
                          </pre>
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </section>

          {/* Help CTA */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col items-center p-8 text-center">
              <h3 className="mb-2 text-xl font-bold">Need Help?</h3>
              <p className="mb-6 text-muted-foreground">
                Check out our help center or join our Discord community for support.
              </p>
              <div className="flex gap-4">
                <Button variant="outline" asChild>
                  <Link href="/help">Help Center</Link>
                </Button>
                <Button asChild>
                  <a href="https://discord.gg/cryptofaucet" target="_blank" rel="noopener noreferrer">
                    Join Discord
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
