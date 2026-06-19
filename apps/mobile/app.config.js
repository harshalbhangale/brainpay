// Dynamic Expo config — reads secrets from the environment so keys are not
// committed in app.json. Loaded by Expo at build/start time. Env is provided
// via the root .env (the dev script runs with --env-file=../../.env) or the
// host's environment in CI/EAS.

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? ''

/** @type {import('@expo/config-types').ExpoConfig} */
module.exports = {
  expo: {
    name: 'BrainPay',
    slug: 'brainpay',
    version: '0.1.0',
    scheme: 'brainpay',
    platforms: ['ios', 'android', 'web'],
    ios: {
      bundleIdentifier: 'tech.brainpay.app',
      config: {
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      },
      supportsTablet: false,
      associatedDomains: ['applinks:brainpay.app'],
      infoPlist: {
        NSCameraUsageDescription: 'BrainPay uses your camera to scan products.',
        NSMicrophoneUsageDescription: 'BrainPay needs the mic only if voice-in is enabled.',
        NFCReaderUsageDescription: 'MoneyPal uses NFC to process payments with your BrainPal card.',
        ITSAppUsesNonExemptEncryption: false,
      },
      entitlements: {
        'com.apple.developer.nfc.readersession.formats': ['TAG'],
      },
    },
    android: {
      package: 'tech.brainpay.app',
      config: {
        googleMaps: {
          apiKey: GOOGLE_MAPS_API_KEY,
        },
      },
      permissions: [
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
      ],
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host: 'brainpay.app' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-camera',
        {
          cameraPermission: 'Allow BrainPay to access your camera so it can scan items.',
        },
      ],
      'expo-audio',
      [
        '@siteed/audio-studio',
        {
          enableBackgroundAudio: true,
          enableDeviceDetection: false,
          enableNotifications: false,
          enablePhoneStateHandling: false,
        },
      ],
      'expo-asset',
      '@config-plugins/react-native-webrtc',
      [
        'expo-notifications',
        {
          icon: './assets/images/notification-icon.png',
          color: '#3DDC84',
          sounds: [],
          mode: 'production',
        },
      ],
      [
        '@stripe/stripe-react-native',
        {
          merchantIdentifier: 'merchant.com.brainpal.pay',
          enableGooglePay: false,
        },
      ],
    ],
    extra: {
      WS_URL: 'wss://api.zapfan.com/live',
      router: {},
      eas: {
        projectId: 'ec4c4c7c-2b42-4a18-84e7-313f71c37c23',
      },
    },
    experiments: {
      reactCompiler: true,
    },
    web: {
      bundler: 'metro',
      output: 'single',
    },
    owner: 'devs404testing',
  },
}
