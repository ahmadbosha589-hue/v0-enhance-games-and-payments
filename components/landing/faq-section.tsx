"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { HelpCircle, MessageCircle } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"

export function FAQSection() {
  const { t } = useLanguage()

  const faqs = [
    { qKey: "faq.q1" as const, aKey: "faq.a1" as const },
    { qKey: "faq.q2" as const, aKey: "faq.a2" as const },
    { qKey: "faq.q3" as const, aKey: "faq.a3" as const },
    { qKey: "faq.q4" as const, aKey: "faq.a4" as const },
    { qKey: "faq.q5" as const, aKey: "faq.a5" as const },
    { qKey: "faq.q6" as const, aKey: "faq.a6" as const },
    { qKey: "faq.q7" as const, aKey: "faq.a7" as const },
    { qKey: "faq.q8" as const, aKey: "faq.a8" as const },
  ]

  return (
    <section id="faq" className="py-12 sm:py-16 md:py-20 lg:py-32" aria-labelledby="faq-heading">
      <div className="container px-4 sm:px-6">
        {/* Header */}
        <div className="mx-auto mb-8 sm:mb-12 md:mb-16 max-w-2xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-3 sm:mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-medium text-primary"
          >
            <HelpCircle className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
            {t("faq.badge")}
          </motion.div>
          <motion.h2
            id="faq-heading"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mb-3 sm:mb-4 text-balance text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight"
          >
            {t("faq.title")} <span className="text-gradient-primary">{t("faq.titleHighlight")}</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-pretty text-sm sm:text-base text-muted-foreground"
          >
            {t("faq.subtitle")}
          </motion.p>
        </div>

        {/* FAQ Accordion */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mx-auto max-w-3xl"
        >
          <Accordion type="single" collapsible className="w-full space-y-3 sm:space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="rounded-lg border border-border/50 bg-card/50 px-4 sm:px-6 backdrop-blur-sm transition-colors data-[state=open]:border-primary/50"
              >
                <AccordionTrigger className="py-3 sm:py-4 text-left text-sm sm:text-base hover:no-underline [&[data-state=open]>svg]:text-primary">
                  <span className="font-medium pr-4">{t(faq.qKey)}</span>
                </AccordionTrigger>
                <AccordionContent className="pb-3 sm:pb-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
                  {t(faq.aKey)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>

        {/* Contact CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-12 sm:mt-16 md:mt-20 pt-8 sm:pt-10 text-center border-t border-border/30"
        >
          <p className="mb-4 sm:mb-6 text-sm sm:text-base text-muted-foreground">{t("faq.contact")}</p>
          <Button variant="outline" size="default" className="bg-transparent" asChild>
            <Link href="/contact" className="gap-2">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              {t("faq.contactButton")}
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
