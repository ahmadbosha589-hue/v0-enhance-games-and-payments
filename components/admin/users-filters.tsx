"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Search, X } from "lucide-react"
import { useState, useTransition } from "react"

export function UsersFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(searchParams.get("search") || "")

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete("page")
    startTransition(() => {
      router.push(`/admin/users?${params.toString()}`)
    })
  }

  const handleSearch = () => {
    updateFilter("search", search)
  }

  const clearFilters = () => {
    setSearch("")
    startTransition(() => {
      router.push("/admin/users")
    })
  }

  return (
    <div className="flex flex-wrap gap-4 items-center">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by username or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="pl-9"
        />
      </div>

      <Select value={searchParams.get("status") || "all"} onValueChange={(v) => updateFilter("status", v)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="flagged">Flagged</SelectItem>
          <SelectItem value="banned">Banned</SelectItem>
        </SelectContent>
      </Select>

      <Select value={searchParams.get("role") || "all"} onValueChange={(v) => updateFilter("role", v)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Roles</SelectItem>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="moderator">Moderator</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="superadmin">Superadmin</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" onClick={handleSearch} disabled={isPending}>
        <Search className="mr-2 h-4 w-4" />
        Search
      </Button>

      {(searchParams.get("search") || searchParams.get("status") || searchParams.get("role")) && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="mr-2 h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  )
}
