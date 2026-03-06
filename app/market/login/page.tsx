"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function MarketLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const run = async () => {
      const response = await fetch("/api/market/auth/session", { cache: "no-store" })
      if (response.ok) {
        router.replace("/market")
      }
    }

    run()
  }, [router])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/market/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Login failed")
      }

      router.replace("/market")
    } catch (err: any) {
      setError(err?.message || "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">营销系统后台登录</h1>
          <p className="mt-1 text-sm text-muted-foreground">登录后可进入用户分析、获客、通知、裂变四个子系统</p>
        </div>

        <div className="space-y-2">
          <Label>用户名</Label>
          <Input value={username} onChange={(event) => setUsername(event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>密码</Label>
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "登录中..." : "登录"}
        </Button>
      </form>
    </div>
  )
}
