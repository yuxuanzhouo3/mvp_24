import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getDatabase } from "@/lib/cloudbase-service"
import { getDEPLOY_REGION } from "@/lib/config/region"
import { verifyMarketAdminToken } from "@/lib/market/admin-auth"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = verifyMarketAdminToken(request)
  if (!auth.ok) return auth.response

  try {
    const region = getDEPLOY_REGION()
    return region === "INTL" ? await getIntlStats() : await getCNStats()
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load stats" },
      { status: 500 }
    )
  }
}

async function getIntlStats() {
  const supabase = getSupabaseAdmin()

  const { data: relations, error: relationsError } = await supabase
    .from("referral_relations")
    .select("inviter_user_id, invited_user_id")

  if (relationsError) throw relationsError

  const inviterMap = new Map<string, string[]>()
  for (const rel of relations || []) {
    if (!inviterMap.has(rel.inviter_user_id)) {
      inviterMap.set(rel.inviter_user_id, [])
    }
    inviterMap.get(rel.inviter_user_id)!.push(rel.invited_user_id)
  }

  const { data: users, error: usersError } = await supabase
    .from("user")
    .select("id, email, full_name")

  if (usersError) throw usersError

  const userMap = new Map(users?.map(u => [u.id, u]) || [])
  const stats = []

  for (const [inviterId, invitedIds] of inviterMap.entries()) {
    const inviter = userMap.get(inviterId)
    if (!inviter) continue

    const { data: payments } = await supabase
      .from("web_payment_transactions")
      .select("gross_amount, profit")
      .in("user_email", invitedIds.map(id => userMap.get(id)?.email).filter(Boolean))
      .eq("payment_status", "completed")

    stats.push({
      inviter_id: inviterId,
      inviter_email: inviter.email,
      inviter_name: inviter.full_name || inviter.email,
      invited_count: invitedIds.length,
      total_payments: payments?.length || 0,
      total_gross_amount: payments?.reduce((sum, p) => sum + (p.gross_amount || 0), 0) || 0,
      total_profit: payments?.reduce((sum, p) => sum + (p.profit || 0), 0) || 0,
    })
  }

  stats.sort((a, b) => b.total_profit - a.total_profit)
  return NextResponse.json({ success: true, stats })
}

async function getCNStats() {
  const db = await getDatabase()

  const relationsResult = await db.collection("web_referral_relations").get()
  const relations = relationsResult?.data || []

  const inviterMap = new Map<string, string[]>()
  for (const rel of relations) {
    const inviterId = rel.inviter_user_id
    const invitedId = rel.invited_user_id
    if (!inviterMap.has(inviterId)) {
      inviterMap.set(inviterId, [])
    }
    inviterMap.get(inviterId)!.push(invitedId)
  }

  const usersResult = await db.collection("web_users").get()
  const users = usersResult?.data || []
  const userMap = new Map(users.map((u: any) => [u._id, u]))

  const paymentsResult = await db.collection("payments").where({ status: "completed" }).get()
  const payments = paymentsResult?.data || []

  const stats = []

  for (const [inviterId, invitedIds] of inviterMap.entries()) {
    const inviter = userMap.get(inviterId)
    if (!inviter) continue

    const invitedEmails = invitedIds.map(id => userMap.get(id)?.email).filter(Boolean)
    const userPayments = payments.filter((p: any) => invitedEmails.includes(p.email))

    stats.push({
      inviter_id: inviterId,
      inviter_email: inviter.email,
      inviter_name: inviter.name || inviter.email,
      invited_count: invitedIds.length,
      total_payments: userPayments.length,
      total_gross_amount: userPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
      total_profit: userPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
    })
  }

  stats.sort((a, b) => b.total_profit - a.total_profit)
  return NextResponse.json({ success: true, stats })
}
