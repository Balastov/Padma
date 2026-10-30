import type { CapacitorConfig } from '@capacitor/cli'

// Online prototype for installation from Xcode / Android Studio.
// Store releases must bundle the frontend instead of using server.url.
const config: CapacitorConfig = {
  appId: 'ru.padma.app.test',
  appName: 'Padma Тест',
  webDir: 'mobile/www',
  backgroundColor: '#f5f8ff',
  appendUserAgent: 'PadmaMobileTest/0.1.0',
  server: {
    url: 'https://www.padma.ru',
    cleartext: false,
    errorPath: 'index.html',
  },
  ios: {
    preferredContentMode: 'mobile',
    contentInset: 'never',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
