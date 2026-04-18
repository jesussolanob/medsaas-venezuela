import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();

  // Verify user is authenticated and is an admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is admin
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch all plan features
  const { data: planFeatures, error } = await supabase
    .from('plan_features')
    .select('*')
    .order('plan')
    .order('feature_key');

  if (error) {
    console.error('Error fetching plan features:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plan features' },
      { status: 500 }
    );
  }

  // Group by plan for easier access
  const groupedByPlan = (planFeatures || []).reduce(
    (acc, feature) => {
      if (!acc[feature.plan]) {
        acc[feature.plan] = [];
      }
      acc[feature.plan].push(feature);
      return acc;
    },
    {} as Record<string, typeof planFeatures>
  );

  return NextResponse.json({
    data: planFeatures,
    grouped: groupedByPlan,
  });
}

export async function PUT(request: NextRequest) {
  const supabase = createAdminClient();

  // Verify user is authenticated and is an admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is admin
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse request body
  const body = await request.json();
  const { plan, feature_key, enabled } = body;

  // Validate input
  if (!plan || !feature_key || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Missing or invalid parameters: plan, feature_key, enabled' },
      { status: 400 }
    );
  }

  // Update the feature
  const { data, error } = await supabase
    .from('plan_features')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('plan', plan)
    .eq('feature_key', feature_key)
    .select()
    .single();

  if (error) {
    console.error('Error updating plan feature:', error);
    return NextResponse.json(
      { error: 'Failed to update plan feature' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: 'Plan feature updated successfully',
    data,
  });
}
