/**
 * D.I. Khan skyline, drawn rather than photographed: the domes and minarets
 * of the old city, water tanks on flat roofs, and the Sulaiman range behind.
 * Vector keeps the onboarding screen under a few KB, which matters on a
 * 3G connection.
 */
export default function Skyline({ className = '' }) {
  return (
    <svg
      viewBox="0 0 480 150"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      role="img"
      aria-label="Illustration of the D.I. Khan skyline"
    >
      {/* Sulaiman range */}
      <path
        d="M0 96 L54 62 L92 84 L140 48 L188 82 L236 58 L286 88 L330 66 L378 92 L424 70 L480 98 L480 150 L0 150 Z"
        fill="currentColor"
        opacity="0.16"
      />

      {/* Rooftops */}
      <g fill="currentColor" opacity="0.34">
        <rect x="8" y="112" width="46" height="38" />
        <rect x="60" y="102" width="30" height="48" />
        <rect x="150" y="108" width="52" height="42" />
        <rect x="300" y="104" width="40" height="46" />
        <rect x="392" y="114" width="54" height="36" />
        {/* roof water tanks */}
        <rect x="20" y="104" width="10" height="9" rx="1.5" />
        <rect x="318" y="96" width="10" height="9" rx="1.5" />
        <rect x="408" y="106" width="10" height="9" rx="1.5" />
      </g>

      {/* Central mosque: dome flanked by minarets */}
      <g fill="currentColor" opacity="0.55">
        <rect x="96" y="86" width="9" height="64" rx="4" />
        <path d="M100.5 74 a7 7 0 0 1 5 12 h-10 a7 7 0 0 1 5 -12z" />
        <circle cx="100.5" cy="70" r="2.6" />

        <rect x="248" y="86" width="9" height="64" rx="4" />
        <path d="M252.5 74 a7 7 0 0 1 5 12 h-10 a7 7 0 0 1 5 -12z" />
        <circle cx="252.5" cy="70" r="2.6" />

        <rect x="112" y="118" width="128" height="32" />
        <path d="M112 118 a64 44 0 0 1 128 0 z" />
        <path d="M176 62 a3 3 0 0 1 3 3 v10 a3 3 0 0 1 -6 0 v-10 a3 3 0 0 1 3 -3z" />
        <circle cx="176" cy="58" r="3.4" />
      </g>

      {/* Arched shopfronts along the bazaar */}
      <g fill="currentColor" opacity="0.42">
        <rect x="356" y="120" width="30" height="30" />
        <path d="M356 120 a15 15 0 0 1 30 0 z" />
        <rect x="272" y="124" width="22" height="26" />
        <path d="M272 124 a11 11 0 0 1 22 0 z" />
      </g>
    </svg>
  )
}
