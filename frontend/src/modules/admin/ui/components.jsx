import { Icon } from './icons';

/* ------------------------------------------------------------ skeletons */

export const Skeleton = ({ w = '100%', h = 12, r, className = '', style }) => (
  <div className={`ad-skel ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />
);

/** Header bar + toolbar + rows, shaped like the list pages it stands in for. */
export const TableSkeleton = ({ rows = 6, cols = 5, toolbar = true }) => (
  <div className="ad-panel" role="status" aria-live="polite" aria-label="Loading">
    {toolbar ? (
      <div className="ad-panel__head" style={{ gap: 12 }}>
        <Skeleton w={220} h={36} r={10} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton w={110} h={36} r={10} />
          <Skeleton w={36} h={36} r={10} />
        </div>
      </div>
    ) : null}
    <div style={{ padding: '6px 20px 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `2.2fr repeat(${cols - 1}, 1fr)`, gap: 16, padding: '12px 0' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} h={9} w={i === 0 ? '40%' : '60%'} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `2.2fr repeat(${cols - 1}, 1fr)`,
            gap: 16,
            alignItems: 'center',
            padding: '14px 0',
            borderTop: '1px solid var(--ad-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skeleton w={36} h={36} r={11} />
            <div style={{ flex: 1, display: 'grid', gap: 7 }}>
              <Skeleton h={10} w={`${55 + ((r * 17) % 35)}%`} />
              <Skeleton h={8} w={`${35 + ((r * 11) % 25)}%`} />
            </div>
          </div>
          {Array.from({ length: cols - 1 }).map((_, c) => (
            <Skeleton key={c} h={c === cols - 2 ? 24 : 10} r={c === cols - 2 ? 999 : undefined} w={c === cols - 2 ? 72 : `${50 + ((r + c) * 13) % 40}%`} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

/** Grid of cards (plans, coupons, banners, KPI tiles). */
export const CardGridSkeleton = ({ count = 6, min = 260, height = 150 }) => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading"
    style={{ display: 'grid', gap: 16, gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))` }}
  >
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="ad-panel" style={{ padding: 18, display: 'grid', gap: 12, minHeight: height }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Skeleton w={42} h={42} r={12} />
          <Skeleton w={64} h={22} r={999} />
        </div>
        <Skeleton h={22} w="45%" r={6} />
        <Skeleton h={10} w="70%" />
        <Skeleton h={10} w="55%" />
      </div>
    ))}
  </div>
);

/** Profile/detail pages: hero card + stat tiles + list. */
export const DetailSkeleton = () => (
  <div role="status" aria-live="polite" aria-label="Loading" style={{ display: 'grid', gap: 16 }}>
    <Skeleton w={120} h={14} />
    <div className="ad-panel" style={{ padding: 22, display: 'flex', gap: 18, alignItems: 'center' }}>
      <Skeleton w={72} h={72} r={20} />
      <div style={{ flex: 1, display: 'grid', gap: 10 }}>
        <Skeleton h={22} w="35%" r={6} />
        <Skeleton h={10} w="55%" />
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton w={80} h={24} r={999} />
          <Skeleton w={96} h={24} r={999} />
        </div>
      </div>
    </div>
    <CardGridSkeleton count={4} min={200} height={110} />
    <TableSkeleton rows={4} toolbar={false} />
  </div>
);

/** Settings/forms: label + field pairs. */
export const FormSkeleton = ({ fields = 6 }) => (
  <div className="ad-panel" role="status" aria-live="polite" aria-label="Loading" style={{ padding: 22, display: 'grid', gap: 18 }}>
    <Skeleton h={20} w="30%" r={6} />
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gap: 8 }}>
          <Skeleton h={9} w="35%" />
          <Skeleton h={40} r={10} />
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Skeleton w={120} h={40} r={12} />
    </div>
  </div>
);

/** Dashboard: KPI tiles + two panels. */
export const DashboardSkeleton = () => (
  <div role="status" aria-live="polite" aria-label="Loading" style={{ display: 'grid', gap: 20 }}>
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="ad-panel" style={{ padding: 18, display: 'grid', gap: 14 }}>
          <Skeleton w={42} h={42} r={12} />
          <Skeleton h={26} w="45%" r={6} />
          <Skeleton h={10} w="60%" />
        </div>
      ))}
    </div>
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))' }}>
      <TableSkeleton rows={4} cols={3} toolbar={false} />
      <TableSkeleton rows={4} cols={3} toolbar={false} />
    </div>
  </div>
);

/* --------------------------------------------------------- page chrome */

export const PageHeader = ({ eyebrow, title, subtitle, actions }) => (
  <div className="ad-page-header">
    <div style={{ minWidth: 0 }}>
      {eyebrow ? <div className="ad-page-header__eyebrow">{eyebrow}</div> : null}
      <h1 className="ad-page-header__title">{title}</h1>
      {subtitle ? <p className="ad-page-header__subtitle">{subtitle}</p> : null}
    </div>
    {actions ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div> : null}
  </div>
);

export const Panel = ({ title, actions, children, bodyStyle, className = '' }) => (
  <section className={`ad-panel ${className}`}>
    {title || actions ? (
      <header className="ad-panel__head">
        {title ? <h2 className="ad-panel__title">{title}</h2> : <span />}
        {actions}
      </header>
    ) : null}
    <div className="ad-panel__body" style={bodyStyle}>
      {children}
    </div>
  </section>
);

const TONES = {
  green: { fg: '#1f7a4c', bg: '#e7f5ed', tint: 'rgba(46,122,79,.14)' },
  blue: { fg: '#2457c5', bg: '#e8efff', tint: 'rgba(37,99,235,.12)' },
  amber: { fg: '#a85a06', bg: '#fdf1df', tint: 'rgba(194,106,6,.14)' },
  red: { fg: '#c0352b', bg: '#fdebe9', tint: 'rgba(208,53,43,.12)' },
  violet: { fg: '#6d3fd6', bg: '#f0eafe', tint: 'rgba(109,63,214,.12)' },
  teal: { fg: '#0e7c86', bg: '#e1f5f6', tint: 'rgba(14,124,134,.12)' },
};

export const KpiCard = ({ label, value, icon, tone = 'green', onClick, hint }) => {
  const t = TONES[tone] || TONES.green;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="ad-kpi"
      style={{ '--_fg': t.fg, '--_bg': t.bg, '--_tint': t.tint, cursor: onClick ? 'pointer' : 'default', width: '100%' }}
    >
      <div className="ad-kpi__icon">
        <Icon name={icon} size={21} />
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div className="ad-kpi__value">{value}</div>
        <div className="ad-kpi__label">{label}</div>
        {hint ? <div style={{ fontSize: '0.74rem', color: 'var(--ad-subtle)' }}>{hint}</div> : null}
      </div>
      {onClick ? (
        <span className="ad-kpi__go">
          <Icon name="arrowUpRight" size={18} />
        </span>
      ) : null}
    </Tag>
  );
};

export const EmptyState = ({ icon = 'inbox', title, text, action }) => (
  <div className="ad-state">
    <div className="ad-state__art">
      <Icon name={icon} size={28} />
    </div>
    <div className="ad-state__title">{title}</div>
    {text ? <p className="ad-state__text">{text}</p> : null}
    {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
  </div>
);

export const ErrorState = ({ title = 'Something went wrong', text, onRetry, retryLabel = 'Try again' }) => (
  <div className="ad-state ad-state--error" role="alert">
    <div className="ad-state__art">
      <Icon name="alert" size={28} />
    </div>
    <div className="ad-state__title">{title}</div>
    {text ? <p className="ad-state__text">{text}</p> : null}
    {onRetry ? (
      <button type="button" className="ad-btn" style={{ marginTop: 6 }} onClick={onRetry}>
        <Icon name="refresh" size={16} />
        {retryLabel}
      </button>
    ) : null}
  </div>
);
