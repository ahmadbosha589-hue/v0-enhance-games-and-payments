import { redirect } from "next/navigation"

// Redirect /admin/dashboard to /admin
export default function AdminDashboardRedirect() {
  redirect("/admin")
}
