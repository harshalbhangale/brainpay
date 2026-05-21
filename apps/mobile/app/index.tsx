import { Redirect } from 'expo-router'

/**
 * Auth gate. Day 2 swaps this for a real session check.
 */
export default function Index() {
  return <Redirect href="/(auth)/phone" />
}
