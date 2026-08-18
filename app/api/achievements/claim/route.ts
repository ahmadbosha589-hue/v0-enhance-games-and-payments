import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

import { requireAdminClient } from "@/lib/supabase/admin-client"
export async function POST(request: NextRequest) {
  try {
    // Get user session
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 503 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { achievementId } = body

    if (!achievementId) {
      return NextResponse.json({ success: false, error: "Achievement ID is required" }, { status: 400 })
    }

    const adminSupabase = requireAdminClient()

    const { data: achievement, error: achError } = await adminSupabase
      .from("achievements")
      .select("*")
      .eq("id", achievementId)
      .single()

    if (achError || !achievement) {
      return NextResponse.json({ success: false, error: "Achievement not found" }, { status: 404 })
    }

    // Get the user achievement record
    const { data: userAchievement, error: uaError } = await adminSupabase
      .from("user_achievements")
      .select("*")
      .eq("user_id", user.id)
      .eq("achievement_id", achievementId)
      .single()

    const isCompleted = await checkDynamicCompletion(adminSupabase, user.id, achievement)

    if (!userAchievement) {
      // No user achievement record exists
      if (!isCompleted) {
        return NextResponse.json({ success: false, error: "Achievement not completed yet" }, { status: 400 })
      }

      // Create the user_achievement record and mark as completed
      const { data: newUserAchievement, error: insertError } = await adminSupabase
        .from("user_achievements")
        .insert({
          user_id: user.id,
          achievement_id: achievementId,
          progress: achievement.requirement_value,
          completed: true,
          completed_at: new Date().toISOString(),
          reward_claimed: false,
        })
        .select()
        .single()

      if (insertError) {
        return NextResponse.json({ success: false, error: "Failed to record achievement" }, { status: 500 })
      }

      // Continue with claiming using the new record
      return await processClaimReward(adminSupabase, user.id, newUserAchievement, achievement)
    }

    // Check if already claimed
    if (userAchievement.reward_claimed) {
      return NextResponse.json({ success: false, error: "Reward already claimed" }, { status: 400 })
    }

    // Check if completed
    if (!userAchievement.completed && !isCompleted) {
      return NextResponse.json({ success: false, error: "Achievement not completed yet" }, { status: 400 })
    }

    // If dynamically completed but record not updated, update it
    if (!userAchievement.completed && isCompleted) {
      await adminSupabase
        .from("user_achievements")
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
          progress: achievement.requirement_value,
        })
        .eq("id", userAchievement.id)

      userAchievement.completed = true
    }

    return await processClaimReward(adminSupabase, user.id, userAchievement, achievement)
  } catch (error) {
    console.error("[Achievement] Claim error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

async function checkDynamicCompletion(adminSupabase: any, userId: string, achievement: any): Promise<boolean> {
  const { category, requirement_value } = achievement

  try {
    // Get user profile with all relevant stats
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select(
        "total_claims, claim_streak, max_claim_streak, total_earned_satoshis, referral_count, total_withdrawn_satoshis",
      )
      .eq("id", userId)
      .single()

    if (profileError || !profile) {
      return false
    }

    let currentProgress = 0

    // Match the exact logic from the frontend achievements page
    switch (category) {
      case "claims":
        currentProgress = profile.total_claims || 0
        break
      case "streak":
        currentProgress = profile.max_claim_streak || profile.claim_streak || 0
        break
      case "earnings":
        currentProgress = profile.total_earned_satoshis || 0
        break
      case "referrals":
        currentProgress = profile.referral_count || 0
        break
      case "withdrawals":
        currentProgress = profile.total_withdrawn_satoshis || 0
        break
      default:
        return false
    }

    return currentProgress >= requirement_value
  } catch (error) {
    console.error("[Achievement] Error checking dynamic completion:", error)
    return false
  }
}

async function processClaimReward(adminSupabase: any, userId: string, userAchievement: any, achievement: any) {
  // Get current user profile
  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("balance_satoshis, total_earned_satoshis, username, display_name")
    .eq("id", userId)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 })
  }

  const rewardAmount = achievement.reward_satoshis || 0
  const newBalance = (profile.balance_satoshis || 0) + rewardAmount
  const newTotalEarned = (profile.total_earned_satoshis || 0) + rewardAmount

  // Update user achievement to mark as claimed
  const { error: updateUAError } = await adminSupabase
    .from("user_achievements")
    .update({
      reward_claimed: true,
      reward_claimed_at: new Date().toISOString(),
    })
    .eq("id", userAchievement.id)

  if (updateUAError) {
    console.error("[Achievement] Failed to update user achievement:", updateUAError)
    return NextResponse.json({ success: false, error: "Failed to claim reward" }, { status: 500 })
  }

  // Update user balance
  const { error: updateProfileError } = await adminSupabase
    .from("profiles")
    .update({
      balance_satoshis: newBalance,
      total_earned_satoshis: newTotalEarned,
    })
    .eq("id", userId)

  if (updateProfileError) {
    console.error("[Achievement] Failed to update profile balance:", updateProfileError)
    // Rollback the achievement claim
    await adminSupabase
      .from("user_achievements")
      .update({
        reward_claimed: false,
        reward_claimed_at: null,
      })
      .eq("id", userAchievement.id)

    return NextResponse.json({ success: false, error: "Failed to update balance" }, { status: 500 })
  }

  const { error: txError } = await adminSupabase.from("transactions").insert({
    user_id: userId,
    type: "achievement",
    amount_satoshis: rewardAmount,
    balance_before: profile.balance_satoshis || 0,
    balance_after: newBalance,
    status: "completed",
    description: `Achievement reward: ${achievement.name}`,
    completed_at: new Date().toISOString(),
    metadata: {
      achievement_id: achievement.id,
      achievement_name: achievement.name,
      xp_reward: achievement.xp_reward,
    },
  })

  if (txError) {
    console.error("[Achievement] Failed to create transaction:", txError)
    // Transaction failed but balance was updated - log this for manual review
  }

  const { error: auditError } = await adminSupabase.from("audit_logs").insert({
    action: "achievement",
    resource_type: "achievement",
    resource_id: achievement.id,
    actor_id: userId,
    metadata: {
      amount: rewardAmount,
      username: profile.username || profile.display_name || "User",
      achievement_name: achievement.name,
      xp_reward: achievement.xp_reward,
    },
  })

  if (auditError) {
    console.error("[Achievement] Failed to create audit log:", auditError)
  }

  // Create a notification
  await adminSupabase.from("notifications").insert({
    user_id: userId,
    type: "achievement",
    title: "Achievement Reward Claimed!",
    message: `You claimed ${rewardAmount.toLocaleString()} satoshis for completing "${achievement.name}"`,
    data: {
      achievement_id: achievement.id,
      reward_satoshis: rewardAmount,
      xp_reward: achievement.xp_reward,
    },
  })

  return NextResponse.json({
    success: true,
    reward: rewardAmount,
    xp: achievement.xp_reward,
    newBalance,
    achievementName: achievement.name,
  })
}
