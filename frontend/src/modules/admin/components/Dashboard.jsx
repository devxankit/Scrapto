import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTruck, FaClock, FaCheckCircle, FaFileInvoice } from 'react-icons/fa';
import { adminAPI } from '../../shared/utils/api';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import { Icon } from '../ui/icons';
import { PageHeader, Panel, KpiCard, EmptyState, ErrorState, DashboardSkeleton } from '../ui/components';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalScrappers: 0,
    activeRequests: 0,
    kycPending: 0,
    revenue: 0,
    todayPickups: 0
  });

  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const staticTexts = [
    "Failed to load dashboard stats",
    "Failed to load dashboard data",
    "{count} KYC submissions pending review",
    "{count} pickup requests pending",
    "{count} orders completed",
    "{count} scrappers registered",
    "New KYC submission pending review",
    "New pickup request created",
    "Order completed successfully",
    "New scrapper registered",
    "Total Users",
    "Total Scrappers",
    "Active Requests",
    "KYC Pending",
    "Total Revenue",
    "Today's Pickups",
    "Welcome back, Admin! 👋",
    "Here's what's happening with your platform today",
    "Request Trends",
    "Chart visualization will be added here",
    "Recent Activity",
    "Quick Actions",
    "Review KYC",
    "Manage Users",
    "View Requests",
    "Update Prices"
  ];
  const { getTranslatedText } = usePageTranslation(staticTexts);

  // Load dashboard data from backend
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminAPI.getDashboardStats();

      if (response.success && response.data?.stats) {
        const backendStats = response.data.stats;

        setStats({
          totalUsers: backendStats.users?.total || 0,
          totalScrappers: backendStats.scrappers?.total || 0,
          activeRequests: backendStats.orders?.pending || 0,
          kycPending: backendStats.scrappers?.pendingKyc || 0,
          revenue: backendStats.payments?.monthlyRevenue || 0,
          todayPickups: backendStats.orders?.today || 0
        });

        // Mock recent activity (can be replaced with backend activity feed later)
        const activity = [
          { id: 1, type: 'kyc', message: getTranslatedText("{count} KYC submissions pending review", { count: backendStats.scrappers?.pendingKyc || 0 }), time: 'Just now', icon: FaClock },
          { id: 2, type: 'request', message: getTranslatedText("{count} pickup requests pending", { count: backendStats.orders?.pending || 0 }), time: 'Just now', icon: FaFileInvoice },
          { id: 3, type: 'order', message: getTranslatedText("{count} orders completed", { count: backendStats.orders?.completed || 0 }), time: 'Just now', icon: FaCheckCircle },
          { id: 4, type: 'scrapper', message: getTranslatedText("{count} scrappers registered", { count: backendStats.scrappers?.total || 0 }), time: 'Just now', icon: FaTruck }
        ];
        setRecentActivity(activity);
      } else {
        throw new Error(response.message || getTranslatedText('Failed to load dashboard stats'));
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');

      // Fallback to localStorage if backend fails
      const userAuth = localStorage.getItem('isAuthenticated');
      const userData = localStorage.getItem('user');
      const totalUsers = userAuth === 'true' && userData ? 1 : 0;

      const scrapperAuth = localStorage.getItem('scrapperAuthenticated');
      const scrapperUser = localStorage.getItem('scrapperUser');
      const totalScrappers = scrapperAuth === 'true' && scrapperUser ? 1 : 0;

      const kycStatus = localStorage.getItem('scrapperKYCStatus');
      const kycPending = kycStatus === 'pending' ? 1 : 0;

      const activeRequest = localStorage.getItem('activeRequest');
      const activeRequests = activeRequest ? 1 : 0;

      const completedOrders = JSON.parse(localStorage.getItem('scrapperCompletedOrders') || '[]');
      const revenue = completedOrders.reduce((sum, order) => sum + (parseFloat(order.paidAmount) || 0), 0);
      const todayPickups = completedOrders.filter(order => {
        const orderDate = new Date(order.completedAt || order.pickedUpAt);
        const today = new Date();
        return orderDate.toDateString() === today.toDateString();
      }).length;

      setStats({
        totalUsers: totalUsers + 150,
        totalScrappers: totalScrappers + 45,
        activeRequests,
        kycPending: kycPending + 8,
        revenue: revenue + 125000,
        todayPickups: todayPickups + 12
      });

      const activity = [
        { id: 1, type: 'kyc', message: getTranslatedText('New KYC submission pending review'), time: '2 minutes ago', icon: FaClock },
        { id: 2, type: 'request', message: getTranslatedText('New pickup request created'), time: '15 minutes ago', icon: FaFileInvoice },
        { id: 3, type: 'order', message: getTranslatedText('Order completed successfully'), time: '1 hour ago', icon: FaCheckCircle },
        { id: 4, type: 'scrapper', message: getTranslatedText('New scrapper registered'), time: '2 hours ago', icon: FaTruck }
      ];
      setRecentActivity(activity);
    } finally {
      setLoading(false);
    }
  };


  const statCards = [
    { title: getTranslatedText('Total Users'), value: stats.totalUsers.toLocaleString('en-IN'), icon: 'users', tone: 'blue', path: '/admin/users' },
    { title: getTranslatedText('Total Scrappers'), value: stats.totalScrappers.toLocaleString('en-IN'), icon: 'truck', tone: 'green', path: '/admin/scrappers' },
    { title: getTranslatedText('Active Requests'), value: stats.activeRequests.toLocaleString('en-IN'), icon: 'clock', tone: 'amber', path: '/admin/requests' },
    { title: getTranslatedText('KYC Pending'), value: stats.kycPending.toLocaleString('en-IN'), icon: 'shield', tone: 'red', path: '/admin/kyc' },
    { title: getTranslatedText('Total Revenue'), value: `₹${(stats.revenue / 1000).toFixed(1)}k`, icon: 'rupee', tone: 'violet', path: '/admin/earnings' },
    // Previously linked to /admin/completed-orders, which has no route and bounced back here.
    { title: getTranslatedText("Today's Pickups"), value: stats.todayPickups.toLocaleString('en-IN'), icon: 'check', tone: 'teal', path: '/admin/orders' },
  ];

  const quickActions = [
    { label: 'Review KYC', path: '/admin/kyc', icon: 'shield', hint: `${stats.kycPending} pending` },
    { label: 'Manage Users', path: '/admin/users', icon: 'users' },
    { label: 'View Requests', path: '/admin/requests', icon: 'clipboard', hint: `${stats.activeRequests} open` },
    { label: 'Update Prices', path: '/admin/prices', icon: 'rupee' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) {
    return (
      <div>
        <PageHeader eyebrow={getTranslatedText('Dashboard')} title={getTranslatedText('Welcome back, Admin! 👋')} subtitle={getTranslatedText("Here's what's happening with your platform today")} />
        <DashboardSkeleton />
      </div>
    );
  }

  const fadeUp = (i = 0) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.04 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  });

  return (
    <div>
      <PageHeader
        eyebrow={`${greeting} · ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}`}
        title={getTranslatedText('Welcome back, Admin! 👋')}
        subtitle={getTranslatedText("Here's what's happening with your platform today")}
        actions={
          <button type="button" className="ad-btn" onClick={loadDashboardData}>
            <Icon name="refresh" size={16} />
            Refresh
          </button>
        }
      />

      {error ? (
        // The fallback in loadDashboardData fills in invented figures; never present them as live data.
        <div className="ad-panel">
          <ErrorState title={getTranslatedText('Failed to load dashboard data')} text={error} onRetry={loadDashboardData} />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* KPIs */}
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(210px, 100%), 1fr))' }}>
            {statCards.map((card, i) => (
              <motion.div key={card.title} {...fadeUp(i)}>
                <KpiCard label={card.title} value={card.value} icon={card.icon} tone={card.tone} onClick={() => navigate(card.path)} />
              </motion.div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
            {/* Request trends (no chart data source yet) */}
            <motion.div {...fadeUp(6)}>
              <Panel title={getTranslatedText('Request Trends')} className="h-full">
                <EmptyState icon="activity" title={getTranslatedText('Request Trends')} text={getTranslatedText('Chart visualization will be added here')} />
              </Panel>
            </motion.div>

            {/* Activity */}
            <motion.div {...fadeUp(7)}>
              <Panel
                title={getTranslatedText('Recent Activity')}
                actions={
                  <span className="ad-chip" style={{ height: 28 }}>
                    <span className="ad-live-dot" />
                    Live
                  </span>
                }
                className="h-full"
              >
                {recentActivity.length === 0 ? (
                  <EmptyState title={getTranslatedText('Recent Activity')} text="Nothing to report yet." />
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                    {recentActivity.map((activity, index) => {
                      const ActIcon = activity.icon;
                      return (
                        <motion.li
                          key={activity.id}
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + index * 0.06 }}
                          className="ad-activity"
                        >
                          <span className="ad-activity__icon">
                            <ActIcon />
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span className="ad-activity__text">{activity.message}</span>
                            <span className="ad-activity__time">{activity.time}</span>
                          </span>
                        </motion.li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </motion.div>
          </div>

          {/* Quick actions */}
          <motion.div {...fadeUp(8)}>
            <Panel title={getTranslatedText('Quick Actions')}>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))' }}>
                {quickActions.map((action) => (
                  <button key={action.label} type="button" className="ad-action" onClick={() => navigate(action.path)}>
                    <span className="ad-action__icon">
                      <Icon name={action.icon} size={20} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span className="ad-action__label">{getTranslatedText(action.label)}</span>
                      {action.hint ? <span className="ad-action__hint">{action.hint}</span> : null}
                    </span>
                    <span className="ad-action__go">
                      <Icon name="chevronRight" size={16} />
                    </span>
                  </button>
                ))}
              </div>
            </Panel>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
