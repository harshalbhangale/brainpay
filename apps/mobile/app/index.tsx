import { Redirect } from 'expo-router'

/**
 * Prototype: skip auth, jump straight into the camera demo.
 * Re-add the auth gate when OTP flow is ready.
 */
export default function Index() {
  return <Redirect href="/(app)/camera" />
}
