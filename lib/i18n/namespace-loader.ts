// =====================================================
// Namespace Loader - Static imports with caching
// =====================================================

import type { Namespace, LanguageCode, TranslationRecord } from "./namespaces/types"

// Static import map for all language/namespace combinations
const namespaceImports: Record<string, () => Promise<Record<string, unknown>>> = {
  // English (has all namespaces)
  "en:common": () => import("./namespaces/en/common"),
  "en:nav": () => import("./namespaces/en/nav"),
  "en:hero": () => import("./namespaces/en/hero"),
  "en:features": () => import("./namespaces/en/features"),
  "en:howItWorks": () => import("./namespaces/en/howItWorks"),
  "en:stats": () => import("./namespaces/en/stats"),
  "en:faq": () => import("./namespaces/en/faq"),
  "en:cta": () => import("./namespaces/en/cta"),
  "en:footer": () => import("./namespaces/en/footer"),
  "en:auth": () => import("./namespaces/en/auth"),
  "en:claim": () => import("./namespaces/en/claim"),
  "en:wallet": () => import("./namespaces/en/wallet"),
  "en:referral": () => import("./namespaces/en/referral"),
  "en:leaderboard": () => import("./namespaces/en/leaderboard"),
  "en:admin": () => import("./namespaces/en/admin"),
  "en:settings": () => import("./namespaces/en/settings"),
  "en:about": () => import("./namespaces/en/about"),
  "en:contact": () => import("./namespaces/en/contact"),
  "en:errors": () => import("./namespaces/en/errors"),
  "en:time": () => import("./namespaces/en/time"),
  "en:adblock": () => import("./namespaces/en/adblock"),
  "en:antibot": () => import("./namespaces/en/antibot"),
  "en:blog": () => import("./namespaces/en/blog"),
  "en:dashboard": () => import("./namespaces/en/dashboard"),
  "en:legal": () => import("./namespaces/en/legal"),
  "en:notifications": () => import("./namespaces/en/notifications"),
  "en:testimonials": () => import("./namespaces/en/testimonials"),

  // Spanish
  "es:common": () => import("./namespaces/es/common"),
  "es:nav": () => import("./namespaces/es/nav"),
  "es:hero": () => import("./namespaces/es/hero"),
  "es:features": () => import("./namespaces/es/features"),
  "es:howItWorks": () => import("./namespaces/es/howItWorks"),
  "es:stats": () => import("./namespaces/es/stats"),
  "es:faq": () => import("./namespaces/es/faq"),
  "es:cta": () => import("./namespaces/es/cta"),
  "es:footer": () => import("./namespaces/es/footer"),
  "es:auth": () => import("./namespaces/es/auth"),
  "es:claim": () => import("./namespaces/es/claim"),
  "es:wallet": () => import("./namespaces/es/wallet"),
  "es:referral": () => import("./namespaces/es/referral"),
  "es:leaderboard": () => import("./namespaces/es/leaderboard"),
  "es:admin": () => import("./namespaces/es/admin"),
  "es:settings": () => import("./namespaces/es/settings"),
  "es:about": () => import("./namespaces/es/about"),
  "es:contact": () => import("./namespaces/es/contact"),
  "es:errors": () => import("./namespaces/es/errors"),
  "es:time": () => import("./namespaces/es/time"),
  "es:adblock": () => import("./namespaces/es/adblock"),
  "es:antibot": () => import("./namespaces/es/antibot"),
  "es:blog": () => import("./namespaces/es/blog"),
  "es:dashboard": () => import("./namespaces/es/dashboard"),
  "es:legal": () => import("./namespaces/es/legal"),
  "es:notifications": () => import("./namespaces/es/notifications"),
  "es:testimonials": () => import("./namespaces/es/testimonials"),

  // French
  "fr:common": () => import("./namespaces/fr/common"),
  "fr:nav": () => import("./namespaces/fr/nav"),
  "fr:hero": () => import("./namespaces/fr/hero"),
  "fr:features": () => import("./namespaces/fr/features"),
  "fr:howItWorks": () => import("./namespaces/fr/howItWorks"),
  "fr:stats": () => import("./namespaces/fr/stats"),
  "fr:faq": () => import("./namespaces/fr/faq"),
  "fr:cta": () => import("./namespaces/fr/cta"),
  "fr:footer": () => import("./namespaces/fr/footer"),
  "fr:auth": () => import("./namespaces/fr/auth"),
  "fr:claim": () => import("./namespaces/fr/claim"),
  "fr:wallet": () => import("./namespaces/fr/wallet"),
  "fr:referral": () => import("./namespaces/fr/referral"),
  "fr:leaderboard": () => import("./namespaces/fr/leaderboard"),
  "fr:admin": () => import("./namespaces/fr/admin"),
  "fr:settings": () => import("./namespaces/fr/settings"),
  "fr:about": () => import("./namespaces/fr/about"),
  "fr:contact": () => import("./namespaces/fr/contact"),
  "fr:errors": () => import("./namespaces/fr/errors"),
  "fr:time": () => import("./namespaces/fr/time"),
  "fr:adblock": () => import("./namespaces/fr/adblock"),
  "fr:antibot": () => import("./namespaces/fr/antibot"),
  "fr:blog": () => import("./namespaces/fr/blog"),
  "fr:dashboard": () => import("./namespaces/fr/dashboard"),
  "fr:legal": () => import("./namespaces/fr/legal"),
  "fr:notifications": () => import("./namespaces/fr/notifications"),
  "fr:testimonials": () => import("./namespaces/fr/testimonials"),

  // German
  "de:common": () => import("./namespaces/de/common"),
  "de:nav": () => import("./namespaces/de/nav"),
  "de:hero": () => import("./namespaces/de/hero"),
  "de:features": () => import("./namespaces/de/features"),
  "de:howItWorks": () => import("./namespaces/de/howItWorks"),
  "de:stats": () => import("./namespaces/de/stats"),
  "de:faq": () => import("./namespaces/de/faq"),
  "de:cta": () => import("./namespaces/de/cta"),
  "de:footer": () => import("./namespaces/de/footer"),
  "de:auth": () => import("./namespaces/de/auth"),
  "de:claim": () => import("./namespaces/de/claim"),
  "de:wallet": () => import("./namespaces/de/wallet"),
  "de:referral": () => import("./namespaces/de/referral"),
  "de:leaderboard": () => import("./namespaces/de/leaderboard"),
  "de:admin": () => import("./namespaces/de/admin"),
  "de:settings": () => import("./namespaces/de/settings"),
  "de:about": () => import("./namespaces/de/about"),
  "de:contact": () => import("./namespaces/de/contact"),
  "de:errors": () => import("./namespaces/de/errors"),
  "de:time": () => import("./namespaces/de/time"),
  "de:adblock": () => import("./namespaces/de/adblock"),
  "de:antibot": () => import("./namespaces/de/antibot"),
  "de:blog": () => import("./namespaces/de/blog"),
  "de:dashboard": () => import("./namespaces/de/dashboard"),
  "de:legal": () => import("./namespaces/de/legal"),
  "de:notifications": () => import("./namespaces/de/notifications"),
  "de:testimonials": () => import("./namespaces/de/testimonials"),

  // Portuguese
  "pt:common": () => import("./namespaces/pt/common"),
  "pt:nav": () => import("./namespaces/pt/nav"),
  "pt:hero": () => import("./namespaces/pt/hero"),
  "pt:features": () => import("./namespaces/pt/features"),
  "pt:howItWorks": () => import("./namespaces/pt/howItWorks"),
  "pt:stats": () => import("./namespaces/pt/stats"),
  "pt:faq": () => import("./namespaces/pt/faq"),
  "pt:cta": () => import("./namespaces/pt/cta"),
  "pt:footer": () => import("./namespaces/pt/footer"),
  "pt:auth": () => import("./namespaces/pt/auth"),
  "pt:claim": () => import("./namespaces/pt/claim"),
  "pt:wallet": () => import("./namespaces/pt/wallet"),
  "pt:referral": () => import("./namespaces/pt/referral"),
  "pt:leaderboard": () => import("./namespaces/pt/leaderboard"),
  "pt:admin": () => import("./namespaces/pt/admin"),
  "pt:settings": () => import("./namespaces/pt/settings"),
  "pt:about": () => import("./namespaces/pt/about"),
  "pt:contact": () => import("./namespaces/pt/contact"),
  "pt:errors": () => import("./namespaces/pt/errors"),
  "pt:time": () => import("./namespaces/pt/time"),
  "pt:adblock": () => import("./namespaces/pt/adblock"),
  "pt:antibot": () => import("./namespaces/pt/antibot"),
  "pt:blog": () => import("./namespaces/pt/blog"),
  "pt:dashboard": () => import("./namespaces/pt/dashboard"),
  "pt:legal": () => import("./namespaces/pt/legal"),
  "pt:notifications": () => import("./namespaces/pt/notifications"),
  "pt:testimonials": () => import("./namespaces/pt/testimonials"),

  "ru:common": () => import("./namespaces/ru/common"),
  "ru:nav": () => import("./namespaces/ru/nav"),
  "ru:hero": () => import("./namespaces/ru/hero"),
  "ru:features": () => import("./namespaces/ru/features"),
  "ru:howItWorks": () => import("./namespaces/ru/howItWorks"),
  "ru:stats": () => import("./namespaces/ru/stats"),
  "ru:faq": () => import("./namespaces/ru/faq"),
  "ru:cta": () => import("./namespaces/ru/cta"),
  "ru:footer": () => import("./namespaces/ru/footer"),
  "ru:auth": () => import("./namespaces/ru/auth"),
  "ru:claim": () => import("./namespaces/ru/claim"),
  "ru:wallet": () => import("./namespaces/ru/wallet"),
  "ru:referral": () => import("./namespaces/ru/referral"),
  "ru:leaderboard": () => import("./namespaces/ru/leaderboard"),
  "ru:admin": () => import("./namespaces/ru/admin"),
  "ru:settings": () => import("./namespaces/ru/settings"),
  "ru:about": () => import("./namespaces/ru/about"),
  "ru:contact": () => import("./namespaces/ru/contact"),
  "ru:errors": () => import("./namespaces/ru/errors"),
  "ru:time": () => import("./namespaces/ru/time"),
  "ru:adblock": () => import("./namespaces/ru/adblock"),
  "ru:antibot": () => import("./namespaces/ru/antibot"),
  "ru:blog": () => import("./namespaces/ru/blog"),
  "ru:dashboard": () => import("./namespaces/ru/dashboard"),
  "ru:legal": () => import("./namespaces/ru/legal"),
  "ru:notifications": () => import("./namespaces/ru/notifications"),
  "ru:testimonials": () => import("./namespaces/ru/testimonials"),

  "zh:common": () => import("./namespaces/zh/common"),
  "zh:nav": () => import("./namespaces/zh/nav"),
  "zh:hero": () => import("./namespaces/zh/hero"),
  "zh:features": () => import("./namespaces/zh/features"),
  "zh:howItWorks": () => import("./namespaces/zh/howItWorks"),
  "zh:stats": () => import("./namespaces/zh/stats"),
  "zh:faq": () => import("./namespaces/zh/faq"),
  "zh:cta": () => import("./namespaces/zh/cta"),
  "zh:footer": () => import("./namespaces/zh/footer"),
  "zh:auth": () => import("./namespaces/zh/auth"),
  "zh:claim": () => import("./namespaces/zh/claim"),
  "zh:wallet": () => import("./namespaces/zh/wallet"),
  "zh:referral": () => import("./namespaces/zh/referral"),
  "zh:leaderboard": () => import("./namespaces/zh/leaderboard"),
  "zh:admin": () => import("./namespaces/zh/admin"),
  "zh:settings": () => import("./namespaces/zh/settings"),
  "zh:about": () => import("./namespaces/zh/about"),
  "zh:contact": () => import("./namespaces/zh/contact"),
  "zh:errors": () => import("./namespaces/zh/errors"),
  "zh:time": () => import("./namespaces/zh/time"),
  "zh:adblock": () => import("./namespaces/zh/adblock"),
  "zh:antibot": () => import("./namespaces/zh/antibot"),
  "zh:blog": () => import("./namespaces/zh/blog"),
  "zh:dashboard": () => import("./namespaces/zh/dashboard"),
  "zh:legal": () => import("./namespaces/zh/legal"),
  "zh:notifications": () => import("./namespaces/zh/notifications"),
  "zh:testimonials": () => import("./namespaces/zh/testimonials"),

  // Japanese
  "ja:common": () => import("./namespaces/ja/common"),
  "ja:nav": () => import("./namespaces/ja/nav"),
  "ja:hero": () => import("./namespaces/ja/hero"),
  "ja:features": () => import("./namespaces/ja/features"),
  "ja:howItWorks": () => import("./namespaces/ja/howItWorks"),
  "ja:stats": () => import("./namespaces/ja/stats"),
  "ja:faq": () => import("./namespaces/ja/faq"),
  "ja:cta": () => import("./namespaces/ja/cta"),
  "ja:footer": () => import("./namespaces/ja/footer"),
  "ja:auth": () => import("./namespaces/ja/auth"),
  "ja:claim": () => import("./namespaces/ja/claim"),
  "ja:wallet": () => import("./namespaces/ja/wallet"),
  "ja:referral": () => import("./namespaces/ja/referral"),
  "ja:leaderboard": () => import("./namespaces/ja/leaderboard"),
  "ja:admin": () => import("./namespaces/ja/admin"),
  "ja:settings": () => import("./namespaces/ja/settings"),
  "ja:about": () => import("./namespaces/ja/about"),
  "ja:contact": () => import("./namespaces/ja/contact"),
  "ja:errors": () => import("./namespaces/ja/errors"),
  "ja:time": () => import("./namespaces/ja/time"),
  "ja:adblock": () => import("./namespaces/ja/adblock"),
  "ja:antibot": () => import("./namespaces/ja/antibot"),
  "ja:blog": () => import("./namespaces/ja/blog"),
  "ja:dashboard": () => import("./namespaces/ja/dashboard"),
  "ja:legal": () => import("./namespaces/ja/legal"),
  "ja:notifications": () => import("./namespaces/ja/notifications"),
  "ja:testimonials": () => import("./namespaces/ja/testimonials"),

  // Korean
  "ko:common": () => import("./namespaces/ko/common"),
  "ko:nav": () => import("./namespaces/ko/nav"),
  "ko:hero": () => import("./namespaces/ko/hero"),
  "ko:features": () => import("./namespaces/ko/features"),
  "ko:howItWorks": () => import("./namespaces/ko/howItWorks"),
  "ko:stats": () => import("./namespaces/ko/stats"),
  "ko:faq": () => import("./namespaces/ko/faq"),
  "ko:cta": () => import("./namespaces/ko/cta"),
  "ko:footer": () => import("./namespaces/ko/footer"),
  "ko:auth": () => import("./namespaces/ko/auth"),
  "ko:claim": () => import("./namespaces/ko/claim"),
  "ko:wallet": () => import("./namespaces/ko/wallet"),
  "ko:referral": () => import("./namespaces/ko/referral"),
  "ko:leaderboard": () => import("./namespaces/ko/leaderboard"),
  "ko:admin": () => import("./namespaces/ko/admin"),
  "ko:settings": () => import("./namespaces/ko/settings"),
  "ko:about": () => import("./namespaces/ko/about"),
  "ko:contact": () => import("./namespaces/ko/contact"),
  "ko:errors": () => import("./namespaces/ko/errors"),
  "ko:time": () => import("./namespaces/ko/time"),
  "ko:adblock": () => import("./namespaces/ko/adblock"),
  "ko:antibot": () => import("./namespaces/ko/antibot"),
  "ko:blog": () => import("./namespaces/ko/blog"),
  "ko:dashboard": () => import("./namespaces/ko/dashboard"),
  "ko:legal": () => import("./namespaces/ko/legal"),
  "ko:notifications": () => import("./namespaces/ko/notifications"),
  "ko:testimonials": () => import("./namespaces/ko/testimonials"),

  // Arabic
  "ar:common": () => import("./namespaces/ar/common"),
  "ar:nav": () => import("./namespaces/ar/nav"),
  "ar:hero": () => import("./namespaces/ar/hero"),
  "ar:features": () => import("./namespaces/ar/features"),
  "ar:howItWorks": () => import("./namespaces/ar/howItWorks"),
  "ar:stats": () => import("./namespaces/ar/stats"),
  "ar:faq": () => import("./namespaces/ar/faq"),
  "ar:cta": () => import("./namespaces/ar/cta"),
  "ar:footer": () => import("./namespaces/ar/footer"),
  "ar:auth": () => import("./namespaces/ar/auth"),
  "ar:claim": () => import("./namespaces/ar/claim"),
  "ar:wallet": () => import("./namespaces/ar/wallet"),
  "ar:referral": () => import("./namespaces/ar/referral"),
  "ar:leaderboard": () => import("./namespaces/ar/leaderboard"),
  "ar:admin": () => import("./namespaces/ar/admin"),
  "ar:settings": () => import("./namespaces/ar/settings"),
  "ar:about": () => import("./namespaces/ar/about"),
  "ar:contact": () => import("./namespaces/ar/contact"),
  "ar:errors": () => import("./namespaces/ar/errors"),
  "ar:time": () => import("./namespaces/ar/time"),
  "ar:adblock": () => import("./namespaces/ar/adblock"),
  "ar:antibot": () => import("./namespaces/ar/antibot"),
  "ar:blog": () => import("./namespaces/ar/blog"),
  "ar:dashboard": () => import("./namespaces/ar/dashboard"),
  "ar:legal": () => import("./namespaces/ar/legal"),
  "ar:notifications": () => import("./namespaces/ar/notifications"),
  "ar:testimonials": () => import("./namespaces/ar/testimonials"),

  // Turkish
  "tr:common": () => import("./namespaces/tr/common"),
  "tr:nav": () => import("./namespaces/tr/nav"),
  "tr:hero": () => import("./namespaces/tr/hero"),
  "tr:features": () => import("./namespaces/tr/features"),
  "tr:howItWorks": () => import("./namespaces/tr/howItWorks"),
  "tr:stats": () => import("./namespaces/tr/stats"),
  "tr:faq": () => import("./namespaces/tr/faq"),
  "tr:cta": () => import("./namespaces/tr/cta"),
  "tr:footer": () => import("./namespaces/tr/footer"),
  "tr:auth": () => import("./namespaces/tr/auth"),
  "tr:claim": () => import("./namespaces/tr/claim"),
  "tr:wallet": () => import("./namespaces/tr/wallet"),
  "tr:referral": () => import("./namespaces/tr/referral"),
  "tr:leaderboard": () => import("./namespaces/tr/leaderboard"),
  "tr:admin": () => import("./namespaces/tr/admin"),
  "tr:settings": () => import("./namespaces/tr/settings"),
  "tr:about": () => import("./namespaces/tr/about"),
  "tr:contact": () => import("./namespaces/tr/contact"),
  "tr:errors": () => import("./namespaces/tr/errors"),
  "tr:time": () => import("./namespaces/tr/time"),
  "tr:adblock": () => import("./namespaces/tr/adblock"),
  "tr:antibot": () => import("./namespaces/tr/antibot"),
  "tr:blog": () => import("./namespaces/tr/blog"),
  "tr:dashboard": () => import("./namespaces/tr/dashboard"),
  "tr:legal": () => import("./namespaces/tr/legal"),
  "tr:notifications": () => import("./namespaces/tr/notifications"),
  "tr:testimonials": () => import("./namespaces/tr/testimonials"),

  // Vietnamese
  "vi:common": () => import("./namespaces/vi/common"),
  "vi:nav": () => import("./namespaces/vi/nav"),
  "vi:hero": () => import("./namespaces/vi/hero"),
  "vi:features": () => import("./namespaces/vi/features"),
  "vi:howItWorks": () => import("./namespaces/vi/howItWorks"),
  "vi:stats": () => import("./namespaces/vi/stats"),
  "vi:faq": () => import("./namespaces/vi/faq"),
  "vi:cta": () => import("./namespaces/vi/cta"),
  "vi:footer": () => import("./namespaces/vi/footer"),
  "vi:auth": () => import("./namespaces/vi/auth"),
  "vi:claim": () => import("./namespaces/vi/claim"),
  "vi:wallet": () => import("./namespaces/vi/wallet"),
  "vi:referral": () => import("./namespaces/vi/referral"),
  "vi:leaderboard": () => import("./namespaces/vi/leaderboard"),
  "vi:admin": () => import("./namespaces/vi/admin"),
  "vi:settings": () => import("./namespaces/vi/settings"),
  "vi:about": () => import("./namespaces/vi/about"),
  "vi:contact": () => import("./namespaces/vi/contact"),
  "vi:errors": () => import("./namespaces/vi/errors"),
  "vi:time": () => import("./namespaces/vi/time"),
  "vi:adblock": () => import("./namespaces/vi/adblock"),
  "vi:antibot": () => import("./namespaces/vi/antibot"),
  "vi:blog": () => import("./namespaces/vi/blog"),
  "vi:dashboard": () => import("./namespaces/vi/dashboard"),
  "vi:legal": () => import("./namespaces/vi/legal"),
  "vi:notifications": () => import("./namespaces/vi/notifications"),
  "vi:testimonials": () => import("./namespaces/vi/testimonials"),

  // Thai
  "th:common": () => import("./namespaces/th/common"),
  "th:nav": () => import("./namespaces/th/nav"),
  "th:hero": () => import("./namespaces/th/hero"),
  "th:features": () => import("./namespaces/th/features"),
  "th:howItWorks": () => import("./namespaces/th/howItWorks"),
  "th:stats": () => import("./namespaces/th/stats"),
  "th:faq": () => import("./namespaces/th/faq"),
  "th:cta": () => import("./namespaces/th/cta"),
  "th:footer": () => import("./namespaces/th/footer"),
  "th:auth": () => import("./namespaces/th/auth"),
  "th:claim": () => import("./namespaces/th/claim"),
  "th:wallet": () => import("./namespaces/th/wallet"),
  "th:referral": () => import("./namespaces/th/referral"),
  "th:leaderboard": () => import("./namespaces/th/leaderboard"),
  "th:admin": () => import("./namespaces/th/admin"),
  "th:settings": () => import("./namespaces/th/settings"),
  "th:about": () => import("./namespaces/th/about"),
  "th:contact": () => import("./namespaces/th/contact"),
  "th:errors": () => import("./namespaces/th/errors"),
  "th:time": () => import("./namespaces/th/time"),
  "th:adblock": () => import("./namespaces/th/adblock"),
  "th:antibot": () => import("./namespaces/th/antibot"),
  "th:blog": () => import("./namespaces/th/blog"),
  "th:dashboard": () => import("./namespaces/th/dashboard"),
  "th:legal": () => import("./namespaces/th/legal"),
  "th:notifications": () => import("./namespaces/th/notifications"),
  "th:testimonials": () => import("./namespaces/th/testimonials"),

  // Indonesian
  "id:common": () => import("./namespaces/id/common"),
  "id:nav": () => import("./namespaces/id/nav"),
  "id:hero": () => import("./namespaces/id/hero"),
  "id:features": () => import("./namespaces/id/features"),
  "id:howItWorks": () => import("./namespaces/id/howItWorks"),
  "id:stats": () => import("./namespaces/id/stats"),
  "id:faq": () => import("./namespaces/id/faq"),
  "id:cta": () => import("./namespaces/id/cta"),
  "id:footer": () => import("./namespaces/id/footer"),
  "id:auth": () => import("./namespaces/id/auth"),
  "id:claim": () => import("./namespaces/id/claim"),
  "id:wallet": () => import("./namespaces/id/wallet"),
  "id:referral": () => import("./namespaces/id/referral"),
  "id:leaderboard": () => import("./namespaces/id/leaderboard"),
  "id:admin": () => import("./namespaces/id/admin"),
  "id:settings": () => import("./namespaces/id/settings"),
  "id:about": () => import("./namespaces/id/about"),
  "id:contact": () => import("./namespaces/id/contact"),
  "id:errors": () => import("./namespaces/id/errors"),
  "id:time": () => import("./namespaces/id/time"),
  "id:adblock": () => import("./namespaces/id/adblock"),
  "id:antibot": () => import("./namespaces/id/antibot"),
  "id:blog": () => import("./namespaces/id/blog"),
  "id:dashboard": () => import("./namespaces/id/dashboard"),
  "id:legal": () => import("./namespaces/id/legal"),
  "id:notifications": () => import("./namespaces/id/notifications"),
  "id:testimonials": () => import("./namespaces/id/testimonials"),

  // Dutch
  "nl:common": () => import("./namespaces/nl/common"),
  "nl:nav": () => import("./namespaces/nl/nav"),
  "nl:hero": () => import("./namespaces/nl/hero"),
  "nl:features": () => import("./namespaces/nl/features"),
  "nl:howItWorks": () => import("./namespaces/nl/howItWorks"),
  "nl:stats": () => import("./namespaces/nl/stats"),
  "nl:faq": () => import("./namespaces/nl/faq"),
  "nl:cta": () => import("./namespaces/nl/cta"),
  "nl:footer": () => import("./namespaces/nl/footer"),
  "nl:auth": () => import("./namespaces/nl/auth"),
  "nl:claim": () => import("./namespaces/nl/claim"),
  "nl:wallet": () => import("./namespaces/nl/wallet"),
  "nl:referral": () => import("./namespaces/nl/referral"),
  "nl:leaderboard": () => import("./namespaces/nl/leaderboard"),
  "nl:admin": () => import("./namespaces/nl/admin"),
  "nl:settings": () => import("./namespaces/nl/settings"),
  "nl:about": () => import("./namespaces/nl/about"),
  "nl:contact": () => import("./namespaces/nl/contact"),
  "nl:errors": () => import("./namespaces/nl/errors"),
  "nl:time": () => import("./namespaces/nl/time"),
  "nl:adblock": () => import("./namespaces/nl/adblock"),
  "nl:antibot": () => import("./namespaces/nl/antibot"),
  "nl:blog": () => import("./namespaces/nl/blog"),
  "nl:dashboard": () => import("./namespaces/nl/dashboard"),
  "nl:legal": () => import("./namespaces/nl/legal"),
  "nl:notifications": () => import("./namespaces/nl/notifications"),
  "nl:testimonials": () => import("./namespaces/nl/testimonials"),

  // Polish
  "pl:common": () => import("./namespaces/pl/common"),
  "pl:nav": () => import("./namespaces/pl/nav"),
  "pl:hero": () => import("./namespaces/pl/hero"),
  "pl:features": () => import("./namespaces/pl/features"),
  "pl:howItWorks": () => import("./namespaces/pl/howItWorks"),
  "pl:stats": () => import("./namespaces/pl/stats"),
  "pl:faq": () => import("./namespaces/pl/faq"),
  "pl:cta": () => import("./namespaces/pl/cta"),
  "pl:footer": () => import("./namespaces/pl/footer"),
  "pl:auth": () => import("./namespaces/pl/auth"),
  "pl:claim": () => import("./namespaces/pl/claim"),
  "pl:wallet": () => import("./namespaces/pl/wallet"),
  "pl:referral": () => import("./namespaces/pl/referral"),
  "pl:leaderboard": () => import("./namespaces/pl/leaderboard"),
  "pl:admin": () => import("./namespaces/pl/admin"),
  "pl:settings": () => import("./namespaces/pl/settings"),
  "pl:about": () => import("./namespaces/pl/about"),
  "pl:contact": () => import("./namespaces/pl/contact"),
  "pl:errors": () => import("./namespaces/pl/errors"),
  "pl:time": () => import("./namespaces/pl/time"),
  "pl:adblock": () => import("./namespaces/pl/adblock"),
  "pl:antibot": () => import("./namespaces/pl/antibot"),
  "pl:blog": () => import("./namespaces/pl/blog"),
  "pl:dashboard": () => import("./namespaces/pl/dashboard"),
  "pl:legal": () => import("./namespaces/pl/legal"),
  "pl:notifications": () => import("./namespaces/pl/notifications"),
  "pl:testimonials": () => import("./namespaces/pl/testimonials"),

  // Ukrainian
  "uk:common": () => import("./namespaces/uk/common"),
  "uk:nav": () => import("./namespaces/uk/nav"),
  "uk:hero": () => import("./namespaces/uk/hero"),
  "uk:features": () => import("./namespaces/uk/features"),
  "uk:howItWorks": () => import("./namespaces/uk/howItWorks"),
  "uk:stats": () => import("./namespaces/uk/stats"),
  "uk:faq": () => import("./namespaces/uk/faq"),
  "uk:cta": () => import("./namespaces/uk/cta"),
  "uk:footer": () => import("./namespaces/uk/footer"),
  "uk:auth": () => import("./namespaces/uk/auth"),
  "uk:claim": () => import("./namespaces/uk/claim"),
  "uk:wallet": () => import("./namespaces/uk/wallet"),
  "uk:referral": () => import("./namespaces/uk/referral"),
  "uk:leaderboard": () => import("./namespaces/uk/leaderboard"),
  "uk:admin": () => import("./namespaces/uk/admin"),
  "uk:settings": () => import("./namespaces/uk/settings"),
  "uk:about": () => import("./namespaces/uk/about"),
  "uk:contact": () => import("./namespaces/uk/contact"),
  "uk:errors": () => import("./namespaces/uk/errors"),
  "uk:time": () => import("./namespaces/uk/time"),
  "uk:adblock": () => import("./namespaces/uk/adblock"),
  "uk:antibot": () => import("./namespaces/uk/antibot"),
  "uk:blog": () => import("./namespaces/uk/blog"),
  "uk:dashboard": () => import("./namespaces/uk/dashboard"),
  "uk:legal": () => import("./namespaces/uk/legal"),
  "uk:notifications": () => import("./namespaces/uk/notifications"),
  "uk:testimonials": () => import("./namespaces/uk/testimonials"),

  // Czech
  "cs:common": () => import("./namespaces/cs/common"),
  "cs:nav": () => import("./namespaces/cs/nav"),
  "cs:hero": () => import("./namespaces/cs/hero"),
  "cs:features": () => import("./namespaces/cs/features"),
  "cs:howItWorks": () => import("./namespaces/cs/howItWorks"),
  "cs:stats": () => import("./namespaces/cs/stats"),
  "cs:faq": () => import("./namespaces/cs/faq"),
  "cs:cta": () => import("./namespaces/cs/cta"),
  "cs:footer": () => import("./namespaces/cs/footer"),
  "cs:auth": () => import("./namespaces/cs/auth"),
  "cs:claim": () => import("./namespaces/cs/claim"),
  "cs:wallet": () => import("./namespaces/cs/wallet"),
  "cs:referral": () => import("./namespaces/cs/referral"),
  "cs:leaderboard": () => import("./namespaces/cs/leaderboard"),
  "cs:admin": () => import("./namespaces/cs/admin"),
  "cs:settings": () => import("./namespaces/cs/settings"),
  "cs:about": () => import("./namespaces/cs/about"),
  "cs:contact": () => import("./namespaces/cs/contact"),
  "cs:errors": () => import("./namespaces/cs/errors"),
  "cs:time": () => import("./namespaces/cs/time"),
  "cs:adblock": () => import("./namespaces/cs/adblock"),
  "cs:antibot": () => import("./namespaces/cs/antibot"),
  "cs:blog": () => import("./namespaces/cs/blog"),
  "cs:dashboard": () => import("./namespaces/cs/dashboard"),
  "cs:legal": () => import("./namespaces/cs/legal"),
  "cs:notifications": () => import("./namespaces/cs/notifications"),
  "cs:testimonials": () => import("./namespaces/cs/testimonials"),

  // Hindi
  "hi:common": () => import("./namespaces/hi/common"),
  "hi:nav": () => import("./namespaces/hi/nav"),
  "hi:hero": () => import("./namespaces/hi/hero"),
  "hi:features": () => import("./namespaces/hi/features"),
  "hi:howItWorks": () => import("./namespaces/hi/howItWorks"),
  "hi:stats": () => import("./namespaces/hi/stats"),
  "hi:faq": () => import("./namespaces/hi/faq"),
  "hi:cta": () => import("./namespaces/hi/cta"),
  "hi:footer": () => import("./namespaces/hi/footer"),
  "hi:auth": () => import("./namespaces/hi/auth"),
  "hi:claim": () => import("./namespaces/hi/claim"),
  "hi:wallet": () => import("./namespaces/hi/wallet"),
  "hi:referral": () => import("./namespaces/hi/referral"),
  "hi:leaderboard": () => import("./namespaces/hi/leaderboard"),
  "hi:admin": () => import("./namespaces/hi/admin"),
  "hi:settings": () => import("./namespaces/hi/settings"),
  "hi:about": () => import("./namespaces/hi/about"),
  "hi:contact": () => import("./namespaces/hi/contact"),
  "hi:errors": () => import("./namespaces/hi/errors"),
  "hi:time": () => import("./namespaces/hi/time"),
  "hi:adblock": () => import("./namespaces/hi/adblock"),
  "hi:antibot": () => import("./namespaces/hi/antibot"),
  "hi:blog": () => import("./namespaces/hi/blog"),
  "hi:dashboard": () => import("./namespaces/hi/dashboard"),
  "hi:legal": () => import("./namespaces/hi/legal"),
  "hi:notifications": () => import("./namespaces/hi/notifications"),
  "hi:testimonials": () => import("./namespaces/hi/testimonials"),

  // Italian
  "it:common": () => import("./namespaces/it/common"),
  "it:nav": () => import("./namespaces/it/nav"),
  "it:hero": () => import("./namespaces/it/hero"),
  "it:features": () => import("./namespaces/it/features"),
  "it:howItWorks": () => import("./namespaces/it/howItWorks"),
  "it:stats": () => import("./namespaces/it/stats"),
  "it:faq": () => import("./namespaces/it/faq"),
  "it:cta": () => import("./namespaces/it/cta"),
  "it:footer": () => import("./namespaces/it/footer"),
  "it:auth": () => import("./namespaces/it/auth"),
  "it:claim": () => import("./namespaces/it/claim"),
  "it:wallet": () => import("./namespaces/it/wallet"),
  "it:referral": () => import("./namespaces/it/referral"),
  "it:leaderboard": () => import("./namespaces/it/leaderboard"),
  "it:admin": () => import("./namespaces/it/admin"),
  "it:settings": () => import("./namespaces/it/settings"),
  "it:about": () => import("./namespaces/it/about"),
  "it:contact": () => import("./namespaces/it/contact"),
  "it:errors": () => import("./namespaces/it/errors"),
  "it:time": () => import("./namespaces/it/time"),
  "it:adblock": () => import("./namespaces/it/adblock"),
  "it:antibot": () => import("./namespaces/it/antibot"),
  "it:blog": () => import("./namespaces/it/blog"),
  "it:dashboard": () => import("./namespaces/it/dashboard"),
  "it:legal": () => import("./namespaces/it/legal"),
  "it:notifications": () => import("./namespaces/it/notifications"),
  "it:testimonials": () => import("./namespaces/it/testimonials"),
}

// In-memory cache for loaded translations
const translationCache: Record<string, TranslationRecord> = {}

// Track failed imports to prevent infinite retries
const failedImports: Set<string> = new Set()

/**
 * Load a single namespace for a language
 */
export async function loadNamespace(lang: LanguageCode, namespace: Namespace): Promise<TranslationRecord> {
  const key = `${lang}:${namespace}`

  // Return cached translation if available
  if (translationCache[key]) {
    return translationCache[key]
  }

  // Return empty object if this import already failed
  if (failedImports.has(key)) {
    return {}
  }

  // Check if import exists in our static map
  const importFn = namespaceImports[key]
  if (!importFn) {
    // Fallback to English if available
    if (lang !== "en") {
      const enKey = `en:${namespace}`
      const enImportFn = namespaceImports[enKey]
      if (enImportFn) {
        try {
          const loadedModule = await enImportFn()
          const translations = extractTranslations(loadedModule)
          translationCache[key] = translations
          return translations
        } catch {
          failedImports.add(key)
          return {}
        }
      }
    }
    failedImports.add(key)
    return {}
  }

  try {
    const loadedModule = await importFn()
    const translations = extractTranslations(loadedModule)
    translationCache[key] = translations
    return translations
  } catch (error) {
    console.warn(`[i18n] Failed to load namespace: ${key}`)
    failedImports.add(key)
    // Fallback to English
    if (lang !== "en") {
      return loadNamespace("en", namespace)
    }
    return {}
  }
}

/**
 * Load multiple namespaces for a language
 */
export async function loadNamespaces(
  lang: LanguageCode,
  namespaces: Namespace[],
): Promise<Record<Namespace, TranslationRecord>> {
  const results: Record<string, TranslationRecord> = {}

  await Promise.all(
    namespaces.map(async (namespace) => {
      results[namespace] = await loadNamespace(lang, namespace)
    }),
  )

  return results as Record<Namespace, TranslationRecord>
}

/**
 * Get translation from cache or load it
 */
export function getTranslation(lang: LanguageCode, namespace: Namespace, key: string): string | undefined {
  const cacheKey = `${lang}:${namespace}`
  const translations = translationCache[cacheKey]

  if (!translations) {
    return undefined
  }

  // Handle nested keys like "header.title"
  const keys = key.split(".")
  let value: TranslationRecord | string | undefined = translations

  for (const k of keys) {
    if (typeof value === "object" && value !== null) {
      value = value[k]
    } else {
      return undefined
    }
  }

  return typeof value === "string" ? value : undefined
}

/**
 * Get cached translation namespace (returns entire namespace object)
 */
export function getCachedTranslation(lang: LanguageCode, namespace: Namespace): TranslationRecord | undefined {
  const cacheKey = `${lang}:${namespace}`
  return translationCache[cacheKey]
}

/**
 * Clear the translation cache
 */
export function clearTranslationCache(): void {
  Object.keys(translationCache).forEach((key) => {
    delete translationCache[key]
  })
  failedImports.clear()
}

/**
 * Preload commonly used namespaces
 */
export async function preloadCommonNamespaces(lang: LanguageCode): Promise<void> {
  const commonNamespaces: Namespace[] = ["common", "nav", "footer"]
  await loadNamespaces(lang, commonNamespaces)
}

export const preloadNamespaces = loadNamespaces

// Function to properly extract named exports (e.g., export const hero = {...})
function extractTranslations(module: Record<string, unknown>): TranslationRecord {
  // If module has default export, use it
  if (module.default && typeof module.default === "object") {
    return module.default as TranslationRecord
  }

  // For named exports like "export const hero = {...}", get the first export that is an object
  const keys = Object.keys(module).filter((k) => k !== "__esModule" && k !== "default")
  if (keys.length === 1 && typeof module[keys[0]] === "object") {
    return module[keys[0]] as TranslationRecord
  }

  // If module itself is the translations object
  if (typeof module === "object" && !Array.isArray(module)) {
    // Filter out module metadata
    const filtered: TranslationRecord = {}
    for (const [key, value] of Object.entries(module)) {
      if (key !== "__esModule" && key !== "default") {
        filtered[key] = value as string | TranslationRecord
      }
    }
    return filtered
  }

  return {}
}
