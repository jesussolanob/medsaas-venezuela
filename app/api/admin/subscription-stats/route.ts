import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    // Verify the caller is authenticated and is a super_admin or admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get all subscriptions with created_at
    const { data: subscriptions, error: subError } = await admin
      .from('subscriptions')
      .select('id, created_at')
      .order('created_at', { ascending: true })

    if (subError) {
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions' },
        { status: 500 }
      )
    }

    // Get current date and calculate 6 months back
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1) // Start of 6 months ago

    // Count subscriptions by month
    const monthCounts: Record<string, number> = {}
    const months = []

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthKey = date.toISOString().slice(0, 7) // YYYY-MM format
      monthCounts[monthKey] = 0
      months.push(monthKey)
    }

    // Count subscriptions created in each month
    ;(subscriptions || []).forEach((sub) => {
      const createdDate = new Date(sub.created_at)
      if (createdDate >= sixMonthsAgo) {
        const monthKey = createdDate.toISOString().slice(0, 7)
        if (monthKey in monthCounts) {
          monthCounts[monthKey]++
        }
      }
    })

    // Format response with month names
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const chartData = months.map((monthKey) => {
      const [year, month] = monthKey.split('-')
      const monthIndex = parseInt(month) - 1
      return {
        month: monthNames[monthIndex],
        count: monthCounts[monthKey],
      }
    })

    // Calculate MoM growth
    const currentMonthCount = chartData[chartData.length - 1].count
    const previousMonthCount = chartData[chartData.length - 2]?.count || 0

    let momGrowth = 0
    if (previousMonthCount > 0) {
      momGrowth = ((currentMonthCount - previousMonthCount) / previousMonthCount) * 100
    } else if (currentMonthCount > 0) {
      momGrowth = 100
    }

    return NextResponse.json({
      chartData,
      momGrowth: parseFloat(momGrowth.toFixed(1)),
      newThisMonth: currentMonthCount,
    })
  } catch (error: any) {
    console.error('Error fetching subscription stats:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
