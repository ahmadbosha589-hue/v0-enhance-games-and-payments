"use client"

import type React from "react"

import { useState, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Clock, ArrowRight, TrendingUp, BookOpen, Shield, Coins, Loader2, Zap } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"
import { NewsletterForm } from "@/components/blog/newsletter-form"

const allPosts = [
  {
    slug: "how-to-maximize-faucet-earnings-2025",
    title: "How to Maximize Your Faucet Earnings in 2025: Complete Guide",
    excerpt:
      "Learn proven strategies to boost your cryptocurrency earnings through faucets, including streak optimization, referral tactics, and timing your claims for maximum rewards.",
    image: "/images/blog/cryptocurrency-bitcoin-golden-coins.jpg",
    category: "Guides",
    readTime: "12 min read",
    date: "Dec 10, 2025",
    featured: true,
    author: {
      name: "Alex Chen",
      avatar: "/images/authors/alex-chen.jpg",
    },
  },
  {
    slug: "bitcoin-price-prediction-2025",
    title: "Bitcoin Price Analysis: What to Expect in 2025",
    excerpt: "Expert analysis of Bitcoin's trajectory and what it means for faucet users and crypto enthusiasts.",
    image: "/images/blog/bitcoin-chart-trading.jpg",
    category: "Market Analysis",
    readTime: "8 min read",
    date: "Dec 9, 2025",
  },
  {
    slug: "understanding-satoshis-beginners",
    title: "Understanding Satoshis: A Beginner's Complete Guide",
    excerpt: "Everything you need to know about the smallest Bitcoin unit and how to accumulate them effectively.",
    image: "/images/blog/bitcoin-satoshi-coins.jpg",
    category: "Education",
    readTime: "6 min read",
    date: "Dec 8, 2025",
  },
  {
    slug: "faucetpay-setup-tutorial",
    title: "FaucetPay Setup Tutorial: Get Started in 5 Minutes",
    excerpt: "Step-by-step guide to setting up your FaucetPay wallet for instant cryptocurrency withdrawals.",
    image: "/images/blog/digital-wallet-crypto.jpg",
    category: "Tutorials",
    readTime: "5 min read",
    date: "Dec 7, 2025",
  },
  {
    slug: "crypto-security-best-practices",
    title: "Crypto Security: Protect Your Digital Assets in 2025",
    excerpt: "Essential security practices every cryptocurrency user should follow to keep their funds safe.",
    image: "/images/blog/cybersecurity-shield.jpg",
    category: "Security",
    readTime: "10 min read",
    date: "Dec 5, 2025",
  },
  {
    slug: "referral-program-strategies",
    title: "Master the Referral Program: Passive Income Strategies",
    excerpt: "How top earners leverage referral programs to build sustainable passive cryptocurrency income.",
    image: "/images/blog/network-referral.jpg",
    category: "Strategies",
    readTime: "7 min read",
    date: "Dec 3, 2025",
  },
  {
    slug: "blockchain-explained-simple",
    title: "Blockchain Technology Explained in Simple Terms",
    excerpt: "Demystifying blockchain technology and why it matters for the future of finance and beyond.",
    image: "/images/blog/blockchain-network.jpg",
    category: "Education",
    readTime: "9 min read",
    date: "Dec 1, 2025",
  },
  {
    slug: "defi-for-beginners",
    title: "DeFi for Beginners: Your First Steps into Decentralized Finance",
    excerpt:
      "A comprehensive introduction to decentralized finance and how it's revolutionizing the financial industry.",
    image: "/images/blog/defi-finance.jpg",
    category: "Education",
    readTime: "11 min read",
    date: "Nov 28, 2025",
  },
  {
    slug: "crypto-taxes-guide",
    title: "Cryptocurrency Taxes: What You Need to Know in 2025",
    excerpt: "Navigate the complex world of cryptocurrency taxation with our comprehensive guide.",
    image: "/images/blog/crypto-taxes.jpg",
    category: "Guides",
    readTime: "14 min read",
    date: "Nov 25, 2025",
  },
  {
    slug: "nft-marketplace-guide",
    title: "NFT Marketplaces: Where to Buy and Sell Digital Art",
    excerpt: "Explore the top NFT marketplaces and learn how to start your digital art collection.",
    image: "/images/blog/nft-digital-art.jpg",
    category: "Guides",
    readTime: "8 min read",
    date: "Nov 22, 2025",
  },
  {
    slug: "ethereum-vs-bitcoin",
    title: "Ethereum vs Bitcoin: Understanding the Key Differences",
    excerpt: "A detailed comparison of the two largest cryptocurrencies and their unique use cases.",
    image: "/images/blog/ethereum-bitcoin-comparison.jpg",
    category: "Education",
    readTime: "10 min read",
    date: "Nov 19, 2025",
  },
  {
    slug: "wallet-security-tips",
    title: "10 Essential Tips to Secure Your Crypto Wallet",
    excerpt: "Protect your digital assets with these proven security measures and best practices.",
    image: "/images/blog/wallet-security.jpg",
    category: "Security",
    readTime: "7 min read",
    date: "Nov 16, 2025",
  },
  {
    slug: "staking-rewards-explained",
    title: "Staking Rewards Explained: Earn Passive Income with Crypto",
    excerpt: "Learn how staking works and how you can earn passive income by holding cryptocurrencies.",
    image: "/images/blog/staking-rewards.jpg",
    category: "Strategies",
    readTime: "9 min read",
    date: "Nov 13, 2025",
  },
  {
    slug: "lightning-network-guide",
    title: "Lightning Network: Instant Bitcoin Transactions Explained",
    excerpt: "Discover how the Lightning Network enables instant, low-fee Bitcoin transactions for everyday use.",
    image: "/images/blog/lightning-network.jpg",
    category: "Education",
    readTime: "8 min read",
    date: "Nov 10, 2025",
  },
  {
    slug: "best-time-to-claim",
    title: "Best Time to Claim: Optimize Your Faucet Strategy",
    excerpt: "Data-driven analysis of optimal claiming times to maximize your cryptocurrency rewards.",
    image: "/images/blog/time-optimization.jpg",
    category: "Strategies",
    readTime: "6 min read",
    date: "Nov 8, 2025",
  },
  {
    slug: "crypto-scams-avoid",
    title: "How to Identify and Avoid Crypto Scams in 2025",
    excerpt: "Learn the red flags of cryptocurrency scams and protect yourself from fraudulent schemes.",
    image: "/images/blog/scam-warning.jpg",
    category: "Security",
    readTime: "11 min read",
    date: "Nov 5, 2025",
  },
  {
    slug: "altcoin-season-guide",
    title: "Altcoin Season: What It Means and How to Prepare",
    excerpt: "Understanding altcoin cycles and positioning yourself for potential gains during altcoin season.",
    image: "/images/blog/altcoins-crypto.jpg",
    category: "Market Analysis",
    readTime: "9 min read",
    date: "Nov 2, 2025",
  },
  {
    slug: "cold-storage-setup",
    title: "Cold Storage Setup: The Ultimate Security Guide",
    excerpt: "Complete guide to setting up cold storage for maximum security of your cryptocurrency holdings.",
    image: "/images/blog/cold-storage.jpg",
    category: "Security",
    readTime: "13 min read",
    date: "Oct 30, 2025",
  },
  {
    slug: "crypto-portfolio-diversification",
    title: "Portfolio Diversification: Balancing Risk in Crypto",
    excerpt: "Strategies for building a diversified cryptocurrency portfolio that balances risk and reward.",
    image: "/images/blog/portfolio-diversification.jpg",
    category: "Strategies",
    readTime: "10 min read",
    date: "Oct 27, 2025",
  },
  {
    slug: "smart-contracts-explained",
    title: "Smart Contracts: The Building Blocks of Web3",
    excerpt: "An introduction to smart contracts and their revolutionary impact on digital agreements.",
    image: "/images/blog/smart-contract.jpg",
    category: "Education",
    readTime: "8 min read",
    date: "Oct 24, 2025",
  },
  {
    slug: "mobile-faucet-tips",
    title: "Mobile Faucet Tips: Claim Crypto on the Go",
    excerpt: "Optimize your mobile claiming experience with these tips for earning crypto anywhere.",
    image: "/images/blog/mobile-crypto-app.jpg",
    category: "Tutorials",
    readTime: "5 min read",
    date: "Oct 21, 2025",
  },
  {
    slug: "bitcoin-halving-impact",
    title: "Bitcoin Halving: Historical Impact and Future Predictions",
    excerpt: "Analyzing past Bitcoin halvings and what they suggest for future price movements.",
    image: "/images/blog/bitcoin-halving.jpg",
    category: "Market Analysis",
    readTime: "12 min read",
    date: "Oct 18, 2025",
  },
  {
    slug: "two-factor-auth-setup",
    title: "Two-Factor Authentication: A Must for Crypto Security",
    excerpt: "Step-by-step guide to setting up 2FA and why it's essential for protecting your crypto accounts.",
    image: "/images/blog/two-factor-auth.jpg",
    category: "Tutorials",
    readTime: "6 min read",
    date: "Oct 15, 2025",
  },
  {
    slug: "compound-earnings-crypto",
    title: "Compound Your Crypto: Reinvestment Strategies That Work",
    excerpt: "Learn how to compound your cryptocurrency earnings for exponential growth over time.",
    image: "/images/blog/compound-growth.jpg",
    category: "Guides",
    readTime: "9 min read",
    date: "Oct 12, 2025",
  },
]

const POSTS_PER_PAGE = 6

export default function BlogPage() {
  const { t } = useLanguage()
  const [visibleCount, setVisibleCount] = useState(POSTS_PER_PAGE)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")

  const categories = useMemo(() => {
    const categoryCounts: Record<string, number> = {}
    allPosts.forEach((post) => {
      categoryCounts[post.category] = (categoryCounts[post.category] || 0) + 1
    })

    const categoryIcons: Record<string, React.ElementType> = {
      Guides: BookOpen,
      "Market Analysis": TrendingUp,
      Security: Shield,
      Education: Coins,
      Strategies: Zap,
      Tutorials: BookOpen,
    }

    const cats = Object.entries(categoryCounts)
      .map(([name, count]) => ({
        name,
        count,
        icon: categoryIcons[name] || BookOpen,
      }))
      .sort((a, b) => b.count - a.count)

    return [{ name: "All", count: allPosts.length, icon: BookOpen }, ...cats]
  }, [])

  // Get featured post
  const featuredPost = useMemo(() => {
    return allPosts.find((post) => post.featured) || allPosts[0]
  }, [])

  const filteredPosts = useMemo(() => {
    return allPosts
      .filter((post) => !post.featured) // Exclude featured from grid
      .filter((post) => {
        const matchesCategory = selectedCategory === "All" || post.category === selectedCategory
        const matchesSearch =
          searchQuery === "" ||
          post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
          post.category.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesCategory && matchesSearch
      })
  }, [selectedCategory, searchQuery])

  // Check if featured post matches current filter
  const showFeatured = useMemo(() => {
    if (!featuredPost) return false
    const matchesCategory = selectedCategory === "All" || featuredPost.category === selectedCategory
    const matchesSearch =
      searchQuery === "" ||
      featuredPost.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      featuredPost.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  }, [featuredPost, selectedCategory, searchQuery])

  const visiblePosts = filteredPosts.slice(0, visibleCount)
  const hasMore = visibleCount < filteredPosts.length
  const totalFiltered = filteredPosts.length + (showFeatured ? 1 : 0)

  const handleLoadMore = () => {
    setIsLoading(true)
    setTimeout(() => {
      setVisibleCount((prev) => prev + POSTS_PER_PAGE)
      setIsLoading(false)
    }, 500)
  }

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category)
    setVisibleCount(POSTS_PER_PAGE)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setVisibleCount(POSTS_PER_PAGE)
  }

  const handleClearFilters = () => {
    setSearchQuery("")
    setSelectedCategory("All")
    setVisibleCount(POSTS_PER_PAGE)
  }

  return (
    <div className="container py-6 sm:py-8 md:py-12 lg:py-16">
      {/* Header */}
      <div className="mx-auto mb-6 sm:mb-8 md:mb-12 max-w-3xl text-center px-2 sm:px-4">
        <Badge variant="outline" className="mb-3 sm:mb-4">
          {t("nav.blog", "CryptoFaucet Blog")}
        </Badge>
        <h1 className="mb-3 sm:mb-4 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
          {t("blog.title", "Insights &")} <span className="text-primary">{t("blog.titleHighlight", "Guides")}</span>
        </h1>
        <p className="mb-4 sm:mb-6 md:mb-8 text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
          {t(
            "blog.subtitle",
            "Stay informed with the latest cryptocurrency news, expert guides, and strategies to maximize your earnings.",
          )}
        </p>

        {/* Search */}
        <form onSubmit={handleSearch} className="mx-auto flex max-w-md gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("blog.searchPlaceholder", "Search articles...")}
              className="pl-10 h-10 sm:h-11 text-sm sm:text-base"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setVisibleCount(POSTS_PER_PAGE)
              }}
            />
          </div>
          <Button type="submit" className="h-10 sm:h-11 px-4 sm:px-6 text-sm sm:text-base">
            {t("blog.search", "Search")}
          </Button>
        </form>
      </div>

      {/* Categories - Horizontal scroll on mobile */}
      <div className="mb-6 sm:mb-8 md:mb-12 -mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 justify-start md:justify-center min-w-max md:min-w-0 md:flex-wrap pb-2">
          {categories.map((category) => (
            <Button
              key={category.name}
              variant={selectedCategory === category.name ? "default" : "outline"}
              size="sm"
              className={`gap-1.5 sm:gap-2 whitespace-nowrap flex-shrink-0 text-xs sm:text-sm h-8 sm:h-9 px-2.5 sm:px-3 ${
                selectedCategory === category.name ? "" : "bg-transparent"
              }`}
              onClick={() => handleCategoryChange(category.name)}
            >
              <category.icon className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>{category.name}</span>
              <Badge
                variant={selectedCategory === category.name ? "secondary" : "outline"}
                className="ml-0.5 sm:ml-1 h-4 sm:h-5 px-1 sm:px-1.5 text-[10px] sm:text-xs"
              >
                {category.count}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {/* Featured Post - Only show if matches filter */}
      {showFeatured && featuredPost && (
        <Card className="mb-6 sm:mb-8 md:mb-12 overflow-hidden border-border/50">
          <div className="grid md:grid-cols-2">
            <div className="relative aspect-[16/10] sm:aspect-video md:aspect-auto md:min-h-[280px] lg:min-h-[320px]">
              <Image
                src={featuredPost.image || "/placeholder.svg"}
                alt={featuredPost.title}
                fill
                className="object-cover"
                priority
              />
              <Badge className="absolute left-2 top-2 sm:left-3 sm:top-3 md:left-4 md:top-4 text-xs">
                {featuredPost.category}
              </Badge>
            </div>
            <div className="flex flex-col justify-center p-4 sm:p-5 md:p-6 lg:p-8">
              <div className="mb-2 sm:mb-3 md:mb-4 flex items-center gap-2 sm:gap-3 md:gap-4 text-[10px] sm:text-xs md:text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4" />
                  {featuredPost.readTime}
                </span>
                <span>{featuredPost.date}</span>
              </div>
              <h2 className="mb-2 sm:mb-3 text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold leading-tight">
                <Link href={`/blog/${featuredPost.slug}`} className="hover:text-primary transition-colors">
                  {featuredPost.title}
                </Link>
              </h2>
              <p className="mb-3 sm:mb-4 md:mb-6 text-xs sm:text-sm md:text-base text-muted-foreground line-clamp-2 sm:line-clamp-3">
                {featuredPost.excerpt}
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                {featuredPost.author && (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Image
                      src={featuredPost.author.avatar || "/placeholder.svg"}
                      alt={featuredPost.author.name}
                      width={32}
                      height={32}
                      className="rounded-full w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9"
                    />
                    <span className="font-medium text-xs sm:text-sm md:text-base">{featuredPost.author.name}</span>
                  </div>
                )}
                <Link
                  href={`/blog/${featuredPost.slug}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline text-xs sm:text-sm md:text-base font-medium"
                >
                  {t("blog.readMore", "Read More")} <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </Link>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Posts Grid */}
      {totalFiltered === 0 ? (
        <div className="text-center py-8 sm:py-12">
          <p className="text-muted-foreground text-sm sm:text-base">
            {t("blog.noResults", "No articles found matching your criteria.")}
          </p>
          <Button variant="outline" className="mt-4 bg-transparent" onClick={handleClearFilters}>
            {t("blog.clearFilters", "Clear filters")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-5 md:gap-6 lg:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePosts.map((post) => (
            <Card
              key={post.slug}
              className="group overflow-hidden border-border/40 bg-gradient-to-b from-card to-card/95 transition-all duration-500 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1"
            >
              <div className="relative aspect-[16/10] sm:aspect-video overflow-hidden">
                <Image
                  src={post.image || "/placeholder.svg"}
                  alt={post.title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                {/* Overlay gradient on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <Badge className="absolute left-2.5 top-2.5 sm:left-3 sm:top-3 text-[10px] sm:text-xs font-medium shadow-sm" variant="secondary">
                  {post.category}
                </Badge>
              </div>
              <CardHeader className="pb-2 sm:pb-2.5 p-3.5 sm:p-4 md:p-5 lg:p-6 lg:pb-3">
                <div className="mb-2 sm:mb-2.5 flex items-center gap-2.5 sm:gap-3 text-[10px] sm:text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    {post.readTime}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>{post.date}</span>
                </div>
                <CardTitle className="line-clamp-2 text-sm sm:text-base md:text-lg transition-colors duration-300 group-hover:text-primary leading-snug">
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-5 md:pt-0 lg:p-6 lg:pt-0">
                <CardDescription className="line-clamp-2 text-xs sm:text-sm">{post.excerpt}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="mt-6 sm:mt-8 md:mt-12 text-center">
          <Button
            variant="outline"
            size="default"
            onClick={handleLoadMore}
            disabled={isLoading}
            className="min-w-[160px] sm:min-w-[200px] bg-transparent h-10 sm:h-11 text-sm sm:text-base"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("blog.loading", "Loading...")}
              </>
            ) : (
              t("blog.loadMore", "Load More Articles")
            )}
          </Button>
          <p className="mt-2 text-[10px] sm:text-xs text-muted-foreground">
            {t("blog.showing", "Showing")} {visiblePosts.length + (showFeatured ? 1 : 0)} {t("blog.of", "of")}{" "}
            {totalFiltered} {t("blog.articles", "articles")}
          </p>
        </div>
      )}

      {/* Newsletter - Premium styling */}
      <Card className="mt-10 sm:mt-14 md:mt-20 border-primary/15 bg-gradient-to-br from-primary/8 via-primary/5 to-accent/5 overflow-hidden relative">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
        </div>
        <CardContent className="relative flex flex-col items-center p-6 sm:p-8 md:p-10 lg:p-12 text-center">
          <Badge variant="outline" className="mb-4 sm:mb-5 border-primary/40 bg-primary/10 text-primary text-xs font-medium px-3 py-1">
            {t("blog.newsletter", "Newsletter")}
          </Badge>
          <h2 className="mb-3 text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">{t("blog.stayUpdated", "Stay Updated")}</h2>
          <p className="mb-5 sm:mb-6 md:mb-8 max-w-lg text-sm sm:text-base text-muted-foreground leading-relaxed">
            {t(
              "blog.newsletterDesc",
              "Get the latest crypto news, guides, and exclusive tips delivered to your inbox weekly.",
            )}
          </p>
          <NewsletterForm />
          <p className="mt-3 sm:mt-4 text-xs text-muted-foreground/80">
            {t("blog.noSpam", "No spam. Unsubscribe anytime.")}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
