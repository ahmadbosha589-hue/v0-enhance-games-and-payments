import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface UsersPaginationProps {
  page: number
  totalPages: number
  searchParams: Record<string, string | undefined>
}

/** Prev/next controls that preserve active search/status/role filters. */
export function UsersPagination({ page, totalPages, searchParams }: UsersPaginationProps) {
  if (totalPages <= 1) return null

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") params.set(key, value)
    }
    params.set("page", String(targetPage))
    return `/admin/users?${params.toString()}`
  }

  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages

  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild disabled={prevDisabled}>
          <Link href={buildHref(page - 1)} aria-disabled={prevDisabled} className={prevDisabled ? "pointer-events-none opacity-50" : ""}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild disabled={nextDisabled}>
          <Link href={buildHref(page + 1)} aria-disabled={nextDisabled} className={nextDisabled ? "pointer-events-none opacity-50" : ""}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
