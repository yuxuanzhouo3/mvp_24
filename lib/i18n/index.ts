/**
 * i18n Utilities
 * 国际化工具函数
 */

import { translations, type Language, type Translations } from './translations'

/**
 * 获取指定语言的完整翻译对象
 * Get complete translation object for specified language
 */
export function getTranslations(language: Language): Translations {
  return translations[language] || translations.zh
}

/**
 * 获取嵌套翻译值
 * Get nested translation value by path
 *
 * @example
 * t('zh', 'header.title') // '多AI协作平台'
 * t('en', 'workspace.placeholder') // 'Enter writing request...'
 */
export function t(language: Language, path: string): string {
  const keys = path.split('.')
  let result: any = translations[language] || translations.zh

  for (const key of keys) {
    result = result?.[key]
    if (result === undefined) {
      console.warn(`[i18n] Translation not found: ${path} for language: ${language}`)
      return path // 返回路径作为fallback
    }
  }

  return typeof result === 'string' ? result : path
}

/**
 * Hook: 获取翻译对象（用于组件中）
 * Hook: Get translations object (for use in components)
 *
 * @example
 * const t = useTranslations(language)
 * <h1>{t.header.title}</h1>
 */
export function useTranslations(language: Language): Translations {
  return getTranslations(language)
}

/**
 * 替换翻译中的占位符
 * Replace placeholders in translations
 *
 * @example
 * interpolate('Hello {name}!', { name: 'World' }) // 'Hello World!'
 * interpolate('{count} items', { count: 5 }) // '5 items'
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return values[key]?.toString() || match
  })
}

/**
 * 格式化相对时间
 * Format relative time
 */
export function formatRelativeTime(date: Date, language: Language): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  const t = getTranslations(language).datetime

  if (seconds < 60) return t.now
  if (minutes < 60) return interpolate(t.minutesAgo, { count: minutes })
  if (hours < 24) return interpolate(t.hoursAgo, { count: hours })
  if (days < 7) return interpolate(t.daysAgo, { count: days })
  if (weeks < 4) return interpolate(t.weeksAgo, { count: weeks })
  if (months < 12) return interpolate(t.monthsAgo, { count: months })
  return interpolate(t.yearsAgo, { count: years })
}

// 导出类型
export type { Language, Translations }
export { translations }
