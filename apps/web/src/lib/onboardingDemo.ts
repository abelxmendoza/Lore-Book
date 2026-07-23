export const ONBOARDING_DEMO_OPEN_EVENT = 'lk:open-onboarding-demo';
export const ONBOARDING_DEMO_COMPLETED_KEY = 'lk_onboarding_demo_completed';
export const ONBOARDING_DEMO_DISMISSED_KEY = 'lk_onboarding_demo_dismissed';

export function openOnboardingDemo() {
  window.dispatchEvent(new CustomEvent(ONBOARDING_DEMO_OPEN_EVENT));
}
