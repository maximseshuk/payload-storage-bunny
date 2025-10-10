import React from 'react'

import './index.scss'

export const ExternalLinkIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={[className, 'icon icon--external-link'].filter(Boolean).join(' ')}
    fill="none"
    viewBox="0 0 16 16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      className="stroke"
      d="M6 2H2C1.44772 2 1 2.44772 1 3V14C1 14.5523 1.44772 15 2 15H13C13.5523 15 14 14.5523 14 14V10M10 1H15M15 1V6M15 1L6 10"
      strokeLinecap="square"
    />
  </svg>
)
