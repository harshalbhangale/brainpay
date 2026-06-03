/**
 * Web stub for @stripe/stripe-react-native.
 * The real package uses native modules that don't exist in a browser.
 * On web we render a passthrough StripeProvider and no-op everything else.
 */
import React from 'react'

export function StripeProvider({ children }) {
  return React.createElement(React.Fragment, null, children)
}

export function useStripe() {
  return {}
}

export function usePaymentSheet() {
  return { initPaymentSheet: async () => ({}), presentPaymentSheet: async () => ({}) }
}

export default { StripeProvider, useStripe, usePaymentSheet }
