import type { ReactNode } from 'react'

import { TablerIcon } from './icons'

interface CardProps {
  title: string
  icon?: string
  href?: string
  horizontal?: boolean
  children?: ReactNode
}

export default function Card({ title, icon, href, horizontal, children }: CardProps) {
  const external = href ? /^https?:\/\//.test(href) : false
  const className = [
    'rp-card',
    horizontal ? 'rp-card--horizontal' : '',
    href ? 'rp-card--link' : '',
    external ? 'rp-card--external' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      {href ? (
        <svg
          className="rp-card__arrow"
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 7h10v10" />
          <path d="M7 17 17 7" />
        </svg>
      ) : null}
      {icon ? (
        <span className="rp-card__icon">
          <TablerIcon name={icon} />
        </span>
      ) : null}
      {horizontal ? (
        <span className="rp-card__body">
          <span className="rp-card__title">{title}</span>
          {children ? <span className="rp-card__desc">{children}</span> : null}
        </span>
      ) : (
        <>
          <span className="rp-card__title">{title}</span>
          {children ? <span className="rp-card__desc">{children}</span> : null}
        </>
      )}
    </>
  )

  if (href) {
    return (
      <a className={className} href={href}>
        {inner}
      </a>
    )
  }

  return <div className={className}>{inner}</div>
}
