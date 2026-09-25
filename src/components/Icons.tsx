/** Iconos de la interfaz (SVG en linea, heredan el color del texto). */

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function IconFolder() {
  return (
    <svg {...base}>
      <path d="M1.9 12.6V3.9a.9.9 0 0 1 .9-.9h3l1.5 2h5.9a.9.9 0 0 1 .9.9v6.7a.9.9 0 0 1-.9.9H2.8a.9.9 0 0 1-.9-.9Z" />
    </svg>
  );
}

export function IconSave() {
  return (
    <svg {...base}>
      <path d="M8 2v6.4" />
      <path d="M5.5 6 8 8.5 10.5 6" />
      <path d="M2.6 11.4v1.2a.9.9 0 0 0 .9.9h9a.9.9 0 0 0 .9-.9v-1.2" />
    </svg>
  );
}

export function IconSaveAs() {
  return (
    <svg {...base}>
      <path d="M9.2 1.9H4.1a.9.9 0 0 0-.9.9v10.4a.9.9 0 0 0 .9.9h7.8a.9.9 0 0 0 .9-.9V5.4L9.2 1.9Z" />
      <path d="M9.1 1.9v3.5h3.6" />
      <path d="M8 8v3.1" />
      <path d="M6.6 9.6 8 11.1l1.4-1.5" />
    </svg>
  );
}

export function IconNew() {
  return (
    <svg {...base}>
      <path d="M9.2 1.9H4.1a.9.9 0 0 0-.9.9v10.4a.9.9 0 0 0 .9.9h7.8a.9.9 0 0 0 .9-.9V5.4L9.2 1.9Z" />
      <path d="M9.1 1.9v3.5h3.6" />
      <path d="M8 7.9v3.4M6.3 9.6h3.4" />
    </svg>
  );
}

export function IconEdit() {
  return (
    <svg {...base}>
      <path d="M11.2 2.1 13.9 4.8 6.1 12.6l-3.2.8.8-3.2 7.5-8.1Z" />
      <path d="M10 3.4l2.6 2.6" />
    </svg>
  );
}

export function IconSplit() {
  return (
    <svg {...base}>
      <rect x="1.9" y="2.9" width="12.2" height="10.2" rx="1.4" />
      <path d="M8 2.9v10.2" />
    </svg>
  );
}

export function IconEye() {
  return (
    <svg {...base}>
      <path d="M1.4 8S4 3.9 8 3.9 14.6 8 14.6 8 12 12.1 8 12.1 1.4 8 1.4 8Z" />
      <circle cx="8" cy="8" r="1.9" />
    </svg>
  );
}

export function IconSun() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" />
    </svg>
  );
}

export function IconMoon() {
  return (
    <svg {...base}>
      <path d="M13.4 9.6A5.7 5.7 0 0 1 6.4 2.6a5.7 5.7 0 1 0 7 7Z" />
    </svg>
  );
}

export function IconChevronDown() {
  return (
    <svg {...base} width={12} height={12}>
      <path d="m3.8 6.2 4.2 4.2 4.2-4.2" />
    </svg>
  );
}

export function IconClose() {
  return (
    <svg {...base} width={12} height={12}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg {...base} width={13} height={13}>
      <path d="M2.6 4.3h10.8M6.3 4.3V2.9h3.4v1.4M3.9 4.3l.6 8.2a.9.9 0 0 0 .9.8h5.2a.9.9 0 0 0 .9-.8l.6-8.2" />
    </svg>
  );
}

/** Logotipo de Markdown, usado en la pantalla de bienvenida. */
export function LogoMarkdown({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2Zm0 1.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H1.75Z"
      />
      <path
        fill="currentColor"
        d="M3 10.6V5.4h1.35L5.8 7.5l1.45-2.1H8.6v5.2H7.25V7.7L5.8 9.8 4.35 7.7v2.9H3Zm7.4-5.2h1.35v2.5h1.6l-2.27 2.7-2.28-2.7h1.6V5.4Z"
      />
    </svg>
  );
}
