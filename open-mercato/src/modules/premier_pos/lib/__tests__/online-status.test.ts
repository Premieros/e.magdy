import { test, expect } from '@jest/globals'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useOnlineStatus } from '../useOnlineStatus'

function Status() { return createElement('span', null, useOnlineStatus() ? 'online' : 'offline') }
test('Node navigator without onLine and browser navigator use the same initial HTML', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    for (const navigatorValue of [{}, { onLine: true }, { onLine: false }]) {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigatorValue })
      expect(renderToStaticMarkup(createElement(Status))).toBe('<span>online</span>')
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
})
