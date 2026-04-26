import type { FC } from 'hono/jsx';

type IconProps = {
  class?: string;
  size?: number;
  title?: string;
};

const baseProps = (size: number, className: string | undefined) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
  class: className ?? 'w-4 h-4',
  'aria-hidden': 'true',
});

export const IconCheck: FC<IconProps> = ({ class: cls, size = 16 }) => (
  <svg {...baseProps(size, cls)}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const IconX: FC<IconProps> = ({ class: cls, size = 16 }) => (
  <svg {...baseProps(size, cls)}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const IconEye: FC<IconProps> = ({ class: cls, size = 16 }) => (
  <svg {...baseProps(size, cls)}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconExternalLink: FC<IconProps> = ({ class: cls, size = 14 }) => (
  <svg {...baseProps(size, cls)}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export const IconChevronDown: FC<IconProps> = ({ class: cls, size = 12 }) => (
  <svg {...baseProps(size, cls)}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const IconArrowDown: FC<IconProps> = ({ class: cls, size = 12 }) => (
  <svg {...baseProps(size, cls)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
);

export const IconArrowUp: FC<IconProps> = ({ class: cls, size = 12 }) => (
  <svg {...baseProps(size, cls)}>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

export const IconArrowLeft: FC<IconProps> = ({ class: cls, size = 14 }) => (
  <svg {...baseProps(size, cls)}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);
