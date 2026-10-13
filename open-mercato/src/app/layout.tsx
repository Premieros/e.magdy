import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import './premier-theme.css'
import '@/lib/i18n/register-dictionary-loader'
import { AppProviders } from '@/components/AppProviders'
import { selectClientDictionary } from '@/lib/i18n/client-dictionary'

import { THEME_INIT_SCRIPT } from '@open-mercato/ui/theme/theme-init-script'
import { detectLocale, loadDictionary, resolveSupportedLocalesForRequest } from '@open-mercato/shared/lib/i18n/server'
import { resolveForcedLocale } from '@open-mercato/shared/lib/i18n/locale'
import { resolveDevRuntimeLayoutConfig } from '@open-mercato/shared/lib/dev-runtime/layout'
import { DevRuntimeDiagnosticsBanner } from '@open-mercato/ui/backend/dev/DevRuntimeDiagnosticsBanner'
import { DevRuntimeReporter } from '@open-mercato/ui/backend/dev/DevRuntimeReporter'

export const metadata: Metadata = {
  title: 'PremierOS',
  description: 'AI-supportive, modular ERP foundation for product & service companies',
  icons: {
    icon: '/brand/premier-os-icon.png',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved server-side (the tenant's Settings selection needs a container and
  // the app registry) and handed to the client provider, which can read neither.
  const supportedLocales = await resolveSupportedLocalesForRequest()
  const locale = await detectLocale({ supportedLocales })
  const fullDictionary = await loadDictionary(locale)
  const pathname = (await headers()).get('x-next-url') ?? ''
  const dict = selectClientDictionary(pathname, fullDictionary)
  const localeLocked = resolveForcedLocale(process.env) !== null
  const demoModeEnabled = process.env.DEMO_MODE !== 'false'
  const noticeBarsEnabled = process.env.OM_INTEGRATION_TEST !== 'true'
  const devRuntime = resolveDevRuntimeLayoutConfig(process.env)
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <head>
        {devRuntime.meta.map((meta) => (
          <meta key={meta.name} name={meta.name} content={meta.content} />
        ))}
      </head>
      <body className="antialiased" suppressHydrationWarning data-gramm="false">
        <script id="om-theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppProviders locale={locale} dict={dict} localeLocked={localeLocked} supportedLocales={supportedLocales} demoModeEnabled={demoModeEnabled} noticeBarsEnabled={noticeBarsEnabled}>
          {devRuntime.enabled ? <DevRuntimeReporter /> : null}
          {devRuntime.bannerEnabled ? <DevRuntimeDiagnosticsBanner /> : null}
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
