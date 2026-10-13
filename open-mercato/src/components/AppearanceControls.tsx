'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme, type Theme } from '@open-mercato/ui/theme/ThemeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export function AppearanceControls() {
  const { theme, setTheme } = useTheme()
  const t = useT()
  const options = [
    { value: 'light', icon: Sun, key: 'common.theme.light' },
    { value: 'dark', icon: Moon, key: 'common.theme.dark' },
    { value: 'system', icon: Monitor, key: 'common.theme.system' },
  ] as const
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label={t('common.theme.toggle')}>
      {options.map(({ value, icon: Icon, key }) => (
        <button key={value} type="button" aria-label={t(key)} title={t(key)} aria-pressed={theme === value}
          onClick={() => setTheme(value as Theme)}
          className={`inline-flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${theme === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
