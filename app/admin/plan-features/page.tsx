import { createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import PlanFeaturesClient from './PlanFeaturesClient';

export default async function PlanFeaturesPage() {
  const supabase = createAdminClient();

  // Verify user is authenticated and is an admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect('/');
  }

  // Fetch all plan features
  const { data: planFeatures, error } = await supabase
    .from('plan_features')
    .select('*')
    .order('plan')
    .order('feature_key');

  if (error) {
    console.error('Error fetching plan features:', error);
    throw new Error('Failed to load plan features');
  }

  return <PlanFeaturesClient initialData={planFeatures || []} />;
}
