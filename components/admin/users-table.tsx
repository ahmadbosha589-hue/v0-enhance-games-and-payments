"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Eye, Ban, Flag, FlagOff, Shield, Copy } from "lucide-react"
import { formatSatoshi, formatRelativeTime } from "@/lib/utils"
import type { Profile } from "@/lib/types/database"
import Link from "next/link"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface UsersTableProps {
  users: (Profile & { auth_email?: string | null })[]
}

export function UsersTable({ users }: UsersTableProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  const handleAction = async (userId: string, action: string) => {
    setLoading(userId)
    try {
      const res = await fetch("/api/admin/users/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      })

      if (!res.ok) throw new Error("Action failed")

      toast.success(`User ${action} successful`)
      router.refresh()
    } catch {
      toast.error("Failed to perform action")
    } finally {
      setLoading(null)
    }
  }

  const copyUserId = (id: string) => {
    navigator.clipboard.writeText(id)
    toast.success("User ID copied to clipboard")
  }

  return (
    <div className="rounded-md border mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User ID</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Balance</TableHead>
            <TableHead>Claims</TableHead>
            <TableHead>Fraud Score</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                No users found
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => {
              const isBanned = user.status === "banned" || !!user.banned_at
              const displayName = user.display_name || user.username || `User ${user.id.slice(0, 8)}`

              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{user.id.slice(0, 8)}...</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyUserId(user.id)}
                        title="Copy full User ID"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.auth_email || user.faucetpay_email || "No email on file"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {isBanned ? (
                        <Badge variant="destructive">Banned</Badge>
                      ) : user.is_flagged ? (
                        <Badge variant="default" className="bg-amber-500/20 text-amber-400">
                          Flagged
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                      {user.role !== "user" && (
                        <Badge variant="outline" className="capitalize">
                          {user.role}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatSatoshi(user.balance_satoshis)}</TableCell>
                  <TableCell>{user.total_claims.toLocaleString()}</TableCell>
                  <TableCell>
                    <span
                      className={
                        user.fraud_score >= 70
                          ? "text-red-500 font-bold"
                          : user.fraud_score >= 40
                            ? "text-amber-500 font-medium"
                            : "text-emerald-500"
                      }
                    >
                      {user.fraud_score}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(user.created_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={loading === user.id}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/users?search=${user.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        {isBanned ? (
                          <DropdownMenuItem onClick={() => handleAction(user.id, "unban")}>
                            <Shield className="mr-2 h-4 w-4" />
                            Unban User
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleAction(user.id, "ban")} className="text-red-500">
                            <Ban className="mr-2 h-4 w-4" />
                            Ban User
                          </DropdownMenuItem>
                        )}
                        {user.is_flagged ? (
                          <DropdownMenuItem onClick={() => handleAction(user.id, "unflag")}>
                            <FlagOff className="mr-2 h-4 w-4" />
                            Remove Flag
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleAction(user.id, "flag")}>
                            <Flag className="mr-2 h-4 w-4" />
                            Flag User
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleAction(user.id, "reset_fraud_score")}>
                          <Shield className="mr-2 h-4 w-4" />
                          Reset Fraud Score
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
