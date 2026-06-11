/**
 * app/doctor/onboarding/layout.tsx
 *
 * Standalone full-screen layout for the doctor onboarding step.
 * Intentionally does NOT include the doctor sidebar/topbar — the
 * onboarding flow must feel like a dedicated activation step, not
 * an interior page of the portal.
 *
 * This nested layout REPLACES the parent doctor/layout.tsx for any
 * route under /doctor/onboarding.
 */

export default function OnboardingStandaloneLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--dh-bone, #F5F4F0)', fontFamily: 'var(--dh-font-body)' }}
    >
      {children}
    </div>
  );
}
