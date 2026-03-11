import Link from "next/link"
import { FileQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="h-12 w-12 text-muted-foreground" />
      </div>
      <h1 className="mb-2 text-4xl font-bold">404</h1>
      <h2 className="mb-4 text-xl text-muted-foreground">Page Not Found</h2>
      <p className="mb-8 max-w-md text-muted-foreground">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/">Go Home</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/help">Get Help</Link>
        </Button>
      </div>
    </div>
  )
}
