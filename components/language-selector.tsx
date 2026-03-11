"use client"

import { useState, useEffect } from "react"
import { Globe, Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useLanguage } from "@/lib/i18n/language-context"
import { ScrollArea } from "@/components/ui/scroll-area"
import Image from "next/image"

const languageToCountry: Record<string, string> = {
  en: "us",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "br",
  ru: "ru",
  zh: "cn",
  ja: "jp",
  ko: "kr",
  ar: "sa",
  tr: "tr",
  vi: "vn",
  th: "th",
  id: "id",
  nl: "nl",
  pl: "pl",
  uk: "ua",
  cs: "cz",
  it: "it", // Italian flag
  hi: "in", // Hindi/India flag
}

function CountryFlag({ languageCode, className = "" }: { languageCode: string; className?: string }) {
  const countryCode = languageToCountry[languageCode] || "us"
  return (
    <Image
      src={`https://flagcdn.com/w40/${countryCode}.png`}
      alt={`${countryCode} flag`}
      width={24}
      height={16}
      className={`rounded-sm object-cover ${className}`}
      unoptimized
    />
  )
}

export function LanguageSelector() {
  const { language, setLanguage, languages, t } = useLanguage()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentLanguage = languages.find((l) => l.code === language)

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <Globe className="h-4 w-4" />
        <span className="sr-only">Select language</span>
      </Button>
    )
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2 sm:px-3"
          aria-label={`${t("language.title")}: ${currentLanguage?.name}`}
        >
          <CountryFlag languageCode={language} />
          <span className="hidden sm:inline text-xs font-medium">{currentLanguage?.name}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="text-xs">{t("language.title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[320px]">
          <div className="p-1">
            {languages.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`cursor-pointer gap-3 rounded-md ${language === lang.code ? "bg-accent" : ""}`}
              >
                <CountryFlag languageCode={lang.code} />
                <span className="flex-1 text-sm">{lang.name}</span>
                {language === lang.code && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
