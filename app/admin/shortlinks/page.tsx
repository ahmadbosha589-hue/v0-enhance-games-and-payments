"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  Link2, Plus, Pencil, Trash2, RefreshCw,
  Loader2, AlertCircle, CheckCircle2, ExternalLink,
} from "lucide-react"

interface Shortlink {
  id: string
  title: string
  destination_url: string
  reward_satoshis: number
  view_time_seconds: number
  is_active: boolean
  created_at: string
}

const emptyForm = { title: "", destination_url: "", reward_satoshis: "50", view_time_seconds: "15" }

export default function AdminShortlinksPage() {
  const [shortlinks, setShortlinks] = useState<Shortlink[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchShortlinks = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch("/api/admin/shortlinks")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setShortlinks(data.shortlinks ?? [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load shortlinks"
      setLoadError(msg)
      toast.error("Failed to load shortlinks", { description: msg })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchShortlinks() }, [fetchShortlinks])

  const openAdd = () => {
    setForm(emptyForm)
    setEditingId(null)
    setDialogOpen(true)
  }

  const openEdit = (sl: Shortlink) => {
    setForm({
      title: sl.title,
      destination_url: sl.destination_url,
      reward_satoshis: String(sl.reward_satoshis),
      view_time_seconds: String(sl.view_time_seconds),
    })
    setEditingId(sl.id)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.destination_url.trim()) {
      toast.error("Title and URL are required")
      return
    }
    try { new URL(form.destination_url) } catch {
      toast.error("Invalid destination URL")
      return
    }
    setIsSaving(true)
    try {
      const method = editingId ? "PATCH" : "POST"
      const body = editingId
        ? { id: editingId, ...form, reward_satoshis: Number(form.reward_satoshis), view_time_seconds: Number(form.view_time_seconds) }
        : { ...form, reward_satoshis: Number(form.reward_satoshis), view_time_seconds: Number(form.view_time_seconds) }
      const res = await fetch("/api/admin/shortlinks", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success(editingId ? "Shortlink updated" : "Shortlink created")
      setDialogOpen(false)
      await fetchShortlinks()
    } catch (err) {
      toast.error("Save failed", { description: err instanceof Error ? err.message : "Unknown error" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggle = async (sl: Shortlink) => {
    try {
      const res = await fetch("/api/admin/shortlinks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sl.id, is_active: !sl.is_active }),
      })
      if (!res.ok) throw new Error()
      setShortlinks(prev => prev.map(s => s.id === sl.id ? { ...s, is_active: !s.is_active } : s))
      toast.success(sl.is_active ? "Shortlink disabled" : "Shortlink enabled")
    } catch {
      toast.error("Failed to update status")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this shortlink? This cannot be undone.")) return
    try {
      const res = await fetch(`/api/admin/shortlinks?id=${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setShortlinks(prev => prev.filter(s => s.id !== id))
      toast.success("Shortlink deleted")
    } catch {
      toast.error("Failed to delete shortlink")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shortlink Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage shortlinks users complete to earn satoshis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchShortlinks} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Shortlink
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Shortlink" : "Add New Shortlink"}</DialogTitle>
                <DialogDescription>
                  Shortlinks are shown to users who must visit the URL for the set duration to earn the reward.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input placeholder="e.g. Visit CryptoNews" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Destination URL</Label>
                  <Input placeholder="https://example.com" value={form.destination_url} onChange={e => setForm(f => ({ ...f, destination_url: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reward (satoshis)</Label>
                    <Input type="number" min="1" value={form.reward_satoshis} onChange={e => setForm(f => ({ ...f, reward_satoshis: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>View time (seconds)</Label>
                    <Input type="number" min="5" max="120" value={form.view_time_seconds} onChange={e => setForm(f => ({ ...f, view_time_seconds: e.target.value }))} />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {editingId ? "Save Changes" : "Create Shortlink"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : shortlinks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Link2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="font-medium text-muted-foreground">No shortlinks yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Click &quot;Add Shortlink&quot; to create the first one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shortlinks.map(sl => (
            <Card key={sl.id} className={`border-border/50 ${!sl.is_active ? "opacity-60" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium truncate">{sl.title}</h3>
                      <Badge variant={sl.is_active ? "default" : "secondary"}>
                        {sl.is_active ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
                        {sl.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <a href={sl.destination_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-1 truncate">
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{sl.destination_url}</span>
                    </a>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>⚡ {sl.reward_satoshis} sats</span>
                      <span>⏱ {sl.view_time_seconds}s view time</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch checked={sl.is_active} onCheckedChange={() => handleToggle(sl)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(sl)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(sl.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>• To auto-shorten URLs when adding links, set <code className="bg-muted px-1 rounded text-xs">SHORTLINK_PROVIDER</code> + the matching API key env var (SHRINKME_API_KEY, EXEIO_API_KEY, FCLC_API_KEY, GPLINKS_API_KEY, or OUOIO_API_KEY).</p>
          <p>• Users see a countdown timer; reward is credited after the full view time elapses.</p>
          <p>• Set view time between 10–30 seconds for best completion rates.</p>
          <p>• Disable a shortlink instead of deleting to preserve completion history.</p>
          <p>• Users can complete up to 20 shortlinks per day.</p>
        </CardContent>
      </Card>
    </div>
  )
}
