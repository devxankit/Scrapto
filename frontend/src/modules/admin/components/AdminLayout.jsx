import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../../shared/context/AdminAuthContext';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import { Icon } from '../ui/icons';
import '../ui/admin.css';
import '../ui/admin-theme.css';
import siteLogo from '../../../assets/scraptox-removebg-preview.png';

const COLLAPSE_KEY = 'scraptox.admin.sidebarCollapsed';

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

const useIsDesktop = () => {
  const query = '(min-width: 1024px)';
  const [desktop, setDesktop] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(query).matches));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e) => setDesktop(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
};

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, logout } = useAdminAuth();
  const staticTexts = [
    'Dashboard',
    'KYC Queue',
    'Users',
    'Scrappers',
    'All Scrappers',
    'Leads',
    'Price Feed',
    'Requests',
    'Subscriptions',
    'All Subscriptions',
    'Manage Plans',
    'Referrals',
    'All Referrals',
    'Settings',
    'Help & Support',
    'Milestone Rewards',
    'Tier Management',
    'Leaderboard',
    'Analytics',
    'Fraud Detection',
    'Campaigns',
    'Reports',
    'Earnings',
    'Withdrawals',
    'Coupons',
    'Ad Banners',
    'Admin Panel',
    'Scraptox',
    'Logout',
    'Administrator',
    'System Settings',
    'Broadcast',
    'Overview',
    'Operations',
    'People',
    'Finance',
    'Growth',
    'Support',
    'Admin Console',
    'My Profile',
    'Profile',
    'Collapse sidebar',
    'Expand sidebar',
    'Open menu',
    'Close menu',
  ];
  const { getTranslatedText: t } = usePageTranslation(staticTexts);

  const isDesktop = useIsDesktop();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fly, setFly] = useState(null);
  const flyTimer = useRef(null);
  const contentRef = useRef(null);
  const menuRef = useRef(null);

  const compact = collapsed && isDesktop;

  // Close the mobile drawer, profile menu and flyout on navigation (state reset
  // during render, as React recommends, instead of a setState-in-effect).
  const [seenPath, setSeenPath] = useState(location.pathname);
  if (seenPath !== location.pathname) {
    setSeenPath(location.pathname);
    setSidebarOpen(false);
    setMenuOpen(false);
    setFly(null);
  }
  // Start each page at the top.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // Storage unavailable: the preference just won't persist.
    }
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setMenuOpen(false);
        setFly(null);
      }
    };
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  const groups = [
    {
      label: t('Overview'),
      items: [
        { icon: 'dashboard', label: t('Dashboard'), path: '/admin', exact: true },
        { icon: 'chart', label: t('Reports'), path: '/admin/reports', motion: 'lift' },
      ],
    },
    {
      label: t('Operations'),
      items: [
        { icon: 'shield', label: t('KYC Queue'), path: '/admin/kyc', motion: 'draw' },
        { icon: 'clipboard', label: t('Requests'), path: '/admin/requests', motion: 'lift' },
        { icon: 'store', label: 'Marketplace', path: '/admin/marketplace', motion: 'lift' },
        { icon: 'rupee', label: t('Price Feed'), path: '/admin/prices', motion: 'tilt' },
      ],
    },
    {
      label: t('People'),
      items: [
        { icon: 'users', label: t('Users'), path: '/admin/users' },
        {
          icon: 'truck',
          label: t('Scrappers'),
          path: '/admin/scrappers',
          motion: 'nudge',
          submenu: [
            { label: t('All Scrappers'), path: '/admin/scrappers' },
            { label: t('Leads'), path: '/admin/scrappers/leads' },
          ],
        },
      ],
    },
    {
      label: t('Finance'),
      items: [
        { icon: 'wallet', label: t('Earnings'), path: '/admin/earnings', motion: 'lift' },
        { icon: 'banknote', label: t('Withdrawals'), path: '/admin/withdrawals', motion: 'lift' },
        {
          icon: 'card',
          label: t('Subscriptions'),
          path: '/admin/subscriptions',
          motion: 'tilt',
          submenu: [
            { label: t('All Subscriptions'), path: '/admin/subscriptions' },
            { label: t('Manage Plans'), path: '/admin/subscriptions/plans' },
          ],
        },
        { icon: 'ticket', label: t('Coupons'), path: '/admin/coupons', motion: 'tilt' },
      ],
    },
    {
      label: t('Growth'),
      items: [
        {
          icon: 'gift',
          label: t('Referrals'),
          path: '/admin/referrals',
          motion: 'lift',
          submenu: [
            { label: t('All Referrals'), path: '/admin/referrals' },
            { label: t('Settings'), path: '/admin/referrals/settings' },
            { label: t('Milestone Rewards'), path: '/admin/referrals/milestones' },
            { label: t('Tier Management'), path: '/admin/referrals/tiers' },
            { label: t('Leaderboard'), path: '/admin/referrals/leaderboard' },
            { label: t('Analytics'), path: '/admin/referrals/analytics' },
            { label: t('Fraud Detection'), path: '/admin/referrals/fraud' },
            { label: t('Campaigns'), path: '/admin/referrals/campaigns' },
          ],
        },
        { icon: 'megaphone', label: t('Ad Banners'), path: '/admin/banners', motion: 'tilt' },
        { icon: 'broadcast', label: t('Broadcast'), path: '/admin/broadcast' },
      ],
    },
    {
      label: t('Support'),
      items: [
        { icon: 'lifebuoy', label: t('Help & Support'), path: '/admin/help-support', motion: 'spin' },
        { icon: 'settings', label: t('System Settings'), path: '/admin/settings', motion: 'spin' },
      ],
    },
  ];

  const isActive = (item) => (item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path));
  const isParentActive = (item) => Array.isArray(item.submenu) && item.submenu.some((sub) => location.pathname === sub.path);

  // Same behaviour as before: a parent with a submenu opens its first page.
  const go = (item) => {
    const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
    if (!hasSubmenu) navigate(item.path);
    else if (!isParentActive(item)) navigate(item.submenu[0].path);
  };

  // Header: group › page › sub-page
  let crumbGroup = null;
  let crumbItem = null;
  for (const g of groups) {
    const hit = g.items.find((it) => isActive(it));
    if (hit) {
      crumbGroup = g.label;
      crumbItem = hit;
      break;
    }
  }
  const crumbSub = crumbItem?.submenu?.find((s) => location.pathname === s.path);
  const isProfile = location.pathname.startsWith('/admin/profile');
  const pageTitle = isProfile
    ? t('My Profile')
    : crumbSub && crumbSub.path !== crumbItem.submenu[0].path
      ? crumbSub.label
      : crumbItem?.label || t('Dashboard');

  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const initial = admin?.name?.charAt(0)?.toUpperCase() || 'A';

  /* --- collapsed-mode flyouts (rendered in a portal: the glass sidebar's
         backdrop-filter would otherwise clip fixed-position children) --- */
  const openFly = useCallback(
    (item, el) => {
      if (!compact) return;
      clearTimeout(flyTimer.current);
      const r = el.getBoundingClientRect();
      // Anchor to the collapsed sidebar width (a fixed token), not the
      // button's right edge, which is stale while the width is animating.
      const shell = el.closest('.admin-ui');
      const railW = parseFloat(shell ? getComputedStyle(shell).getPropertyValue('--ad-sidebar-w-collapsed') : '') || 68;
      setFly({ item, top: r.top, left: railW + 10, height: r.height });
    },
    [compact]
  );
  const closeFlySoon = () => {
    clearTimeout(flyTimer.current);
    flyTimer.current = setTimeout(() => setFly(null), 140);
  };
  useEffect(() => () => clearTimeout(flyTimer.current), []);

  const renderItem = (item) => {
    const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
    const active = isActive(item) || isParentActive(item);
    const open = hasSubmenu && active && !compact;
    return (
      <div key={item.path}>
        <button
          type="button"
          className={`ad-nav__item${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}
          onClick={() => {
            go(item);
            setFly(null);
          }}
          onMouseEnter={(e) => openFly(item, e.currentTarget)}
          onMouseLeave={closeFlySoon}
          onFocus={(e) => openFly(item, e.currentTarget)}
          onBlur={closeFlySoon}
          aria-current={active && !hasSubmenu ? 'page' : undefined}
          aria-expanded={hasSubmenu ? open : undefined}
          aria-label={compact ? item.label : undefined}
        >
          {active ? (
            <motion.span
              layoutId="ad-nav-pill"
              className="ad-nav__pill"
              transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.9 }}
            />
          ) : null}
          <span className="ad-nav__icon">
            <Icon name={item.icon} size={20} motion={item.motion} />
          </span>
          <span className="ad-nav__text">{item.label}</span>
          {hasSubmenu ? (
            <span className="ad-nav__chev">
              <Icon name="chevronDown" size={16} />
            </span>
          ) : null}
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="sub"
              className="ad-nav__sub"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {item.submenu.map((sub) => (
                <button
                  type="button"
                  key={sub.path}
                  className={`ad-nav__subitem${location.pathname === sub.path ? ' is-active' : ''}`}
                  onClick={() => navigate(sub.path)}
                  aria-current={location.pathname === sub.path ? 'page' : undefined}
                >
                  {sub.label}
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="admin-ui ad-shell">
      {/* Mobile scrim */}
      <AnimatePresence>
        {sidebarOpen && !isDesktop ? (
          <motion.div
            key="scrim"
            className="ad-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`ad-sidebar${compact ? ' is-collapsed' : ''}${sidebarOpen ? ' is-mobile-open' : ''}`}
        aria-label={t('Admin Panel')}
      >
        <div className="ad-brand">
          <div className="ad-brand__mark">
            <img src={siteLogo} alt="Scraptox" />
            <svg className="ad-brand__ring" viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="24" />
            </svg>
          </div>
          {!compact ? (
            <div className="ad-brand__text">
              <div className="ad-brand__name">
                Scrap<span>tox</span>
              </div>
              <div className="ad-brand__tag">
                <span className="ad-live-dot" />
                {t('Admin Console')}
              </div>
            </div>
          ) : null}
          {!isDesktop ? (
            <button type="button" className="ad-icon-btn" style={{ marginLeft: 'auto' }} onClick={() => setSidebarOpen(false)} aria-label={t('Close menu')}>
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </div>

        {isDesktop ? (
          <button
            type="button"
            className="ad-collapse-btn"
            onClick={() => {
              setCollapsed((c) => !c);
              setFly(null);
            }}
            aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
            title={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          >
            <Icon name="chevronsLeft" size={15} />
          </button>
        ) : null}

        <LayoutGroup id="ad-nav">
          <nav className="ad-nav" onScroll={() => setFly(null)}>
            {groups.map((g) => (
              <div className="ad-nav__group" key={g.label}>
                <div className="ad-nav__label">{g.label}</div>
                <div style={{ display: 'grid', gap: 2 }}>{g.items.map(renderItem)}</div>
              </div>
            ))}
          </nav>
        </LayoutGroup>

        <div className="ad-sidebar__foot">
          <div className="ad-user">
            <button
              type="button"
              className="ad-avatar"
              style={{ border: 0, cursor: 'pointer' }}
              onClick={() => navigate('/admin/profile')}
              aria-label={t('My Profile')}
              onMouseEnter={(e) => openFly({ label: admin?.name || 'Admin', path: '__me' }, e.currentTarget)}
              onMouseLeave={closeFlySoon}
            >
              {initial}
            </button>
            <div className="ad-user__meta">
              <div className="ad-user__name">{admin?.name || 'Admin'}</div>
              <div className="ad-user__mail">{admin?.email || 'admin@scraptox.com'}</div>
            </div>
            <button type="button" className="ad-icon-btn ad-icon-btn--danger ad-user__logout" onClick={handleLogout} aria-label={t('Logout')} title={t('Logout')}>
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Collapsed flyout */}
      {fly && compact
        ? createPortal(
            <div className="admin-ui">
              <div
                className={`ad-flyout${fly.item.submenu ? '' : ' ad-flyout--tip'}`}
                style={{ top: fly.item.submenu ? fly.top - 6 : fly.top + fly.height / 2 - 16, left: fly.left }}
                onMouseEnter={() => clearTimeout(flyTimer.current)}
                onMouseLeave={closeFlySoon}
                role={fly.item.submenu ? 'menu' : 'tooltip'}
              >
                {fly.item.submenu ? (
                  <>
                    <div className="ad-flyout__title">{fly.item.label}</div>
                    {fly.item.submenu.map((sub) => (
                      <button
                        type="button"
                        role="menuitem"
                        key={sub.path}
                        className={`ad-nav__subitem${location.pathname === sub.path ? ' is-active' : ''}`}
                        onClick={() => {
                          navigate(sub.path);
                          setFly(null);
                        }}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </>
                ) : (
                  fly.item.label
                )}
              </div>
            </div>,
            document.body
          )
        : null}

      {/* Main */}
      <div className={`ad-main${compact ? ' is-collapsed' : ''}`}>
        <header className="ad-header">
          {!isDesktop ? (
            <button type="button" className="ad-icon-btn" onClick={() => setSidebarOpen(true)} aria-label={t('Open menu')}>
              <Icon name="menu" size={20} />
            </button>
          ) : null}

          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="ad-crumbs">
              <span>{t('Admin Panel')}</span>
              {crumbGroup && !isProfile ? (
                <>
                  <Icon name="chevronRight" size={12} />
                  <span>{crumbGroup}</span>
                </>
              ) : null}
              {crumbItem && !isProfile && pageTitle !== crumbItem.label ? (
                <>
                  <Icon name="chevronRight" size={12} />
                  <span>{crumbItem.label}</span>
                </>
              ) : null}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.h2
                key={pageTitle}
                className="ad-header__title"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                {pageTitle}
              </motion.h2>
            </AnimatePresence>
          </div>

          <span className="ad-chip hidden md:inline-flex">
            <Icon name="calendar" size={15} />
            {today}
          </span>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="ad-profile-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="ad-avatar" style={{ width: 34, height: 34, borderRadius: 10 }}>
                {initial}
              </span>
              <span className="hidden sm:block" style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--ad-ink)' }}>{admin?.name || 'Admin'}</span>
                <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--ad-muted)' }}>{admin?.role || t('Administrator')}</span>
              </span>
              <Icon name="chevronDown" size={16} className="hidden sm:block" style={{ color: 'var(--ad-muted)' }} />
            </button>
            <AnimatePresence>
              {menuOpen ? (
                <motion.div
                  className="ad-menu"
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--ad-border)', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{admin?.name || 'Admin'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ad-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {admin?.email || 'admin@scraptox.com'}
                    </div>
                  </div>
                  <button type="button" role="menuitem" className="ad-menu__item" onClick={() => navigate('/admin/profile')}>
                    <Icon name="user" size={17} />
                    {t('My Profile')}
                  </button>
                  <button type="button" role="menuitem" className="ad-menu__item" onClick={() => navigate('/admin/settings')}>
                    <Icon name="settings" size={17} />
                    {t('System Settings')}
                  </button>
                  <button type="button" role="menuitem" className="ad-menu__item ad-menu__item--danger" onClick={handleLogout}>
                    <Icon name="logout" size={17} />
                    {t('Logout')}
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </header>

        <main ref={contentRef} className="ad-content">
          {/* Opacity only: a transform here would become the containing block
              for the pages' position:fixed modals and trap them in this box. */}
          <motion.div
            key={location.pathname}
            className="ad-content__inner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
