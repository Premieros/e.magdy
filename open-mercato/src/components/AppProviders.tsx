"use client"

import { useEffect, type ReactNode } from 'react'
import { DirectionProvider } from '@radix-ui/react-direction'
import { usePathname } from 'next/navigation'
import type { Locale } from '@open-mercato/shared/lib/i18n/config'
import type { Dict } from '@open-mercato/shared/lib/i18n/context'
import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { ThemeProvider } from '@open-mercato/ui/theme/ThemeProvider'
import { QueryProvider } from '@open-mercato/ui/theme/QueryProvider'
import { FrontendLayout } from '@open-mercato/ui/frontend/Layout'
import { AuthFooter } from '@open-mercato/ui/frontend/AuthFooter'
import { ClientBootstrapProvider, resolveClientBootstrapProfile } from '@/components/ClientBootstrap'
import { GlobalNoticeBars } from '@/components/GlobalNoticeBars'
import { ComponentOverridesBootstrap } from '@/components/ComponentOverridesBootstrap'
import { AppearanceControls } from '@/components/AppearanceControls'

type AppProvidersProps = {
  children: ReactNode
  locale: Locale
  dict: Dict
  localeLocked: boolean
  supportedLocales: readonly Locale[]
  demoModeEnabled: boolean
  noticeBarsEnabled: boolean
}

export function AppProviders({ children, locale, dict, localeLocked, supportedLocales, demoModeEnabled, noticeBarsEnabled }: AppProvidersProps) {
  const profile = resolveClientBootstrapProfile(usePathname())
  const direction = locale === 'ar' ? 'rtl' : 'ltr'
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = direction
  }, [locale, direction])
  return (
    <DirectionProvider dir={direction}>
      <I18nProvider locale={locale} dict={dict} localeLocked={localeLocked} supportedLocales={supportedLocales}>
        <ClientBootstrapProvider profile={profile}>
          <ComponentOverridesBootstrap profile={profile}>
            <ThemeProvider>
              <QueryProvider>
                <FrontendLayout footer={<AuthFooter />} header={profile === 'login' || profile === 'public' ? (
                  <div className="flex items-center justify-end px-4 py-2"><AppearanceControls /></div>
                ) : undefined}>{children}</FrontendLayout>
                {noticeBarsEnabled ? <GlobalNoticeBars demoModeEnabled={demoModeEnabled} /> : null}
              </QueryProvider>
            </ThemeProvider>
          </ComponentOverridesBootstrap>
        </ClientBootstrapProvider>
      </I18nProvider>
    </DirectionProvider>
  )
}
