/** Hand-drawn ink-stroke icons made for HOPIUM. Slightly wobbly on purpose. No icon library. */
type P = { size?: number; className?: string; title?: string };

function Svg({ size = 20, className, title, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
      strokeLinejoin="round" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const PrinterIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6.2 9.1V3.4c2.1-.2 7.9-.3 11.6.1l.1 5.5" />
    <path d="M4 9.3c5.4-.5 10.6-.4 16.1 0 .4 2.3.3 5-.1 7.4l-2.1.1" />
    <path d="M6.1 16.9 4 16.8c-.4-2.4-.4-5 0-7.5" />
    <path d="M6.6 13.4c3.6-.2 7.3-.2 10.9.1l-.2 7.1c-3.5.4-7.1.3-10.6-.1z" />
    <path d="M8.9 16.2h5.8M8.8 18.3h4" />
  </Svg>
);

export const ReceiptIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5.8 3.2 7.6 4.6 9.5 3.1l1.8 1.5 1.9-1.4 1.8 1.4 1.9-1.5 1.7 1.3c.3 5.4.3 10.8 0 16.2l-1.8-1.3-1.9 1.4-1.8-1.4-1.9 1.5-1.8-1.5-1.9 1.4-1.7-1.3c-.4-5.5-.4-10.9-.1-16.5z" />
    <path d="M8.6 8.4h6.9M8.5 11.6h4.8M8.7 14.7h6.2" />
  </Svg>
);

export const ClockIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12.2 3.3c5 .1 8.6 3.9 8.5 8.8-.2 4.9-4.1 8.6-8.9 8.5-4.8-.1-8.5-4.1-8.4-8.9.1-4.6 3.9-8.5 8.8-8.4z" />
    <path d="M12 7.2c.1 1.7.1 3.4 0 5.1l3.4 2.1" />
  </Svg>
);

export const ArrowUpIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12.1 20.3c-.2-5.4-.2-10.8 0-16.4" />
    <path d="M6.4 9.6c2-1.9 3.8-3.8 5.6-5.8 2 2 3.9 3.9 5.6 5.9" />
  </Svg>
);

export const ArrowDownIcon = (p: P) => (
  <Svg {...p}>
    <path d="M11.9 3.7c.2 5.4.2 10.8 0 16.4" />
    <path d="M17.6 14.4c-2 1.9-3.8 3.8-5.6 5.8-2-2-3.9-3.9-5.6-5.9" />
  </Svg>
);

export const PencilIcon = (p: P) => (
  <Svg {...p}>
    <path d="m4.2 19.9.8-4.1L16 4.6c1-.9 2.3-.8 3.2.1.9 1 .9 2.2 0 3.2L8.4 19.1z" />
    <path d="m14.2 6.6 3.3 3.2M4.9 15.9l3.4 3.2" />
  </Svg>
);

export const WarningIcon = (p: P) => (
  <Svg {...p}>
    <path d="M11.8 3.6c3 5.1 5.9 10.6 8.7 16.4-5.7.4-11.4.4-17.1 0 2.6-5.6 5.4-11.1 8.4-16.4z" />
    <path d="M12 9.4c.1 1.9.1 3.7 0 5.5M12 17.4v.2" />
  </Svg>
);

export const JamIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4.2 9.2c5.3-.5 10.7-.5 15.9 0 .4 2.4.3 4.9-.1 7.3-5.3.4-10.5.4-15.7 0-.4-2.4-.5-4.9-.1-7.3z" />
    <path d="M7.4 9c.6-1.8 1.2-3.6 1.7-5.5M12.3 9l.4-5.4M16.9 9.1c-.4-1.9-.8-3.7-1.3-5.6" />
    <path d="M8.4 12.9c2.3-1.2 4.6 1.1 7 0" />
  </Svg>
);
