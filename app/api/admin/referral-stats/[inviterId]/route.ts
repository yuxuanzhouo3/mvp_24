import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getDatabase } from "@/lib/cloudbase-service"
import { getDEPLOY_REGION } from "@/lib/config/region"
import { verifyMarketAdminToken } from "@/lib/market/admin-auth"

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  { params }: { params: { inviterId: string } }
) {
  const auth = verifyMarketAdminToken(request)
  if (!auth.ok) return auth.response

  try {
    const { inviterId } = params
    const region = getDEPLOY_REGION()
    return region === "INTL" ? await getIntlInviterDetail(inviterId) : await getCNInviterDetail(inviterId)
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load stats" },
      { status: 500 }
    )
  }
}

async function getIntlInviterDetail(inviterId: string) {
  const supabase = getSupabaseAdmin()

  const { data: inviter, error: inviterError } = await supabase
    .from("user")
    .select("id, email, full_name")
    .eq("id", inviterId)
    .single()

  if (inviterError) throw inviterError

  const { data: relations, error: relationsError } = await supabase
    .from("referral_relations")
    .select("invited_user_id, created_at")
    .eq("inviter_user_id", inviterId)

  if (relationsError) throw relationsError

  const invitedIds = relations?.map(r => r.invited_user_id) || []
  const { data: invitedUsers } = await supabase
    .from("user")
    .select("id, email, full_name")
    .in("id", invitedIds)

  const userMap = new Map(invitedUsers?.map(u => [u.id, u]) || [])
  const invitedStats = []

  for (const rel of relations || []) {
    const user = userMap.get(rel.invited_user_id)
    if (!user) continue

    const { data: payments } = await supabase
      .from("web_payment_transactions")
      .select("gross_amount, profit, payment_time")
      .eq("user_email", user.email)
      .eq("payment_status", "completed")

    invitedStats.push({
      user_id: user.id,
      user_email: user.email,
      user_name: user.full_name || user.email,
      invited_at: rel.created_at,
      total_payments: payments?.length || 0,
      total_gross_amount: payments?.reduce((sum, p) => sum + (p.gross_amount || 0), 0) || 0,
      total_profit: payments?.reduce((sum, p) => sum + (p.profit || 0), 0) || 0,
      payments: payments || [],
    })
  }

  invitedStats.sort((a, b) => b.total_profit - a.total_profit)

  return NextResponse.json({
    success: true,
    summary: {
      inviter: { id: inviter.id, email: inviter.email, name: inviter.full_name || inviter.email },
      total_invited: invitedStats.length,
      total_payments: invitedStats.reduce((sum, s) => sum + s.total_payments, 0),
      total_gross_amount: invitedStats.reduce((sum, s) => sum + s.total_gross_amount, 0),
      total_profit: invitedStats.reduce((sum, s) => sum + s.total_profit, 0),
    },
    invited_users: invitedStats
  })
}

async function getCNInviterDetail(inviterId: string) {
  const db = await getDatabase()

  const inviterResult = await db.collection("web_users").where({ _id: inviterId }).limit(1).get()
  const inviter = inviterResult?.data?.[0]
  if (!inviter) throw new Error("Inviter not found")

  const relationsResult = await db.collection("web_referral_relations").where({ inviter_user_id: inviterId }).get()
  const relations = relationsResult?.data || []

  const invitedIds = relations.map((r: any) => r.invited_user_id)
  const usersResult = await db.collection("web_users").where({ _id: db.command.in(invitedIds) }).get()
  const users = usersResult?.data || []
  const userMap = new Map(users.map((u: any) => [u._id, u]))

  const paymentsResult = await db.collection("payments").where({ status: "completed" }).get()
  const payments = paymentsResult?.data || []

  const invitedStats = []

  for (const rel of relations) {
    const user = userMap.get(rel.invited_user_id)
    if (!user) continue

    const userPayments = payments.filter((p: any) => p.email === user.email)

    invitedStats.push({
      user_id: user._id,
      user_email: user.email,
      user_name: user.name || user.email,
      invited_at: rel.created_at,
      total_payments: userPayments.length,
      total_gross_amount: userPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
      total_profit: userPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
      payments: userPayments,
    })
  }

  invitedStats.sort((a, b) => b.total_profit - a.total_profit)

  return NextResponse.json({
    success: true,
    summary: {
      inviter: { id: inviter._id, email: inviter.email, name: inviter.name || inviter.email },
      total_invited: invitedStats.length,
      total_payments: invitedStats.reduce((sum, s) => sum + s.total_payments, 0),
      total_gross_amount: invitedStats.reduce((sum, s) => sum + s.total_gross_amount, 0),
      total_profit: invitedStats.reduce((sum, s) => sum + s.total_profit, 0),
    },
    invited_users: invitedStats
  })
}
