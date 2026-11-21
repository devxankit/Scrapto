import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../shared/context/AdminAuthContext';
import { authAPI } from '../../shared/utils/api';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import { Icon } from '../ui/icons';
import '../ui/admin.css';
import '../ui/admin-theme.css';
import siteLogo from '../../../assets/scraptox-removebg-preview.png';

const AdminLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAdminAuth();
  const staticTexts = [
    "Please enter a valid email address",
    "Access denied. Admin access only.",
    "Invalid email or password",
    "Invalid email or password. Please try again.",
    "Admin Portal",
    "Sign in to manage the platform",
    "Email",
    "Enter email address",
    "Password",
    "Enter password",
    "Signing in...",
    "Sign In",
    "Secure admin access only"
  ];
  const { getTranslatedText } = usePageTranslation(staticTexts);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate email format
    if (!email || !email.includes('@')) {
      setError(getTranslatedText('Please enter a valid email address'));
      setLoading(false);
      return;
    }

    try {
      // Call backend API for admin login
      const response = await authAPI.login(email, password);

      if (response.success && response.data?.user) {
        const userData = response.data.user;
        const token = response.data.token;

        // Verify user is admin
        if (userData.role !== 'admin') {
          setError(getTranslatedText('Access denied. Admin access only.'));
          setLoading(false);
          return;
        }

        // Store admin data
        const adminData = {
          id: userData._id || userData.id,
          name: userData.name,
          email: userData.email,
          role: 'admin',
          permissions: ['all']
        };

        login(adminData, token);
        navigate('/admin', { replace: true });
      } else {
        setError(getTranslatedText('Invalid email or password'));
      }
    } catch (err) {
      console.error('Admin login error:', err);
      setError(err.message || getTranslatedText('Invalid email or password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="admin-ui ad-login">
      {/* Brand panel (desktop) */}
      <motion.aside
        className="ad-login__brand"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        aria-hidden="true"
      >
        <svg className="ad-login__pattern" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="adGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="470" cy="120" r="180" fill="url(#adGlow)" />
          <g fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="1.2">
            <circle className="ad-login__orbit" cx="300" cy="300" r="140" strokeDasharray="4 10" />
            <circle className="ad-login__orbit ad-login__orbit--slow" cx="300" cy="300" r="210" strokeDasharray="2 14" />
            <circle className="ad-login__orbit" cx="300" cy="300" r="280" strokeDasharray="1 18" />
          </g>
        </svg>
        <div className="ad-login__brand-inner">
          <div className="ad-login__logo">
            <img src={siteLogo} alt="" />
          </div>
          <h2 className="ad-login__headline">
            Run Scraptox
            <br />
            from one place.
          </h2>
          <p className="ad-login__lede">Pickups, partners, payouts and pricing — every operation in a single, secure console.</p>
          <ul className="ad-login__points">
            {['KYC and partner onboarding', 'Live pickup requests and orders', 'Earnings, withdrawals and subscriptions'].map((p, i) => (
              <motion.li key={p} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }}>
                <Icon name="check" size={18} />
                {p}
              </motion.li>
            ))}
          </ul>
        </div>
      </motion.aside>

      {/* Form */}
      <main className="ad-login__main">
        <motion.div
          className="ad-login__card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="ad-login__mobile-logo">
            <img src={siteLogo} alt="Scraptox" />
          </div>
          <div className="ad-page-header__eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="shield" size={14} />
            {getTranslatedText('Admin Portal')}
          </div>
          <h1 className="ad-login__title">{getTranslatedText('Sign in to manage the platform')}</h1>

          <form onSubmit={handleSubmit} className="ad-login__form">
            <AnimatePresence>
              {error ? (
                <motion.div
                  key="err"
                  className="ad-login__error"
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Icon name="alert" size={17} />
                  <span>{error}</span>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <label className="ad-field">
              <span className="ad-field__label">{getTranslatedText('Email')}</span>
              <span className={`ad-field__control${error ? ' is-invalid' : ''}`}>
                <svg className="ad-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <rect x="2" y="4" width="20" height="16" rx="3" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <input
                  className="ad-bare"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={getTranslatedText('Enter email address')}
                  autoComplete="username"
                  required
                  autoFocus
                />
              </span>
            </label>

            <label className="ad-field">
              <span className="ad-field__label">{getTranslatedText('Password')}</span>
              <span className={`ad-field__control${error ? ' is-invalid' : ''}`}>
                <svg className="ad-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2.5" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  className="ad-bare"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={getTranslatedText('Enter password')}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="ad-icon-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="ad-ico" viewBox="0 0 24 24" width="18" height="18">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <path d="M1 1l22 22" />
                    </svg>
                  ) : (
                    <svg className="ad-ico" viewBox="0 0 24 24" width="18" height="18">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </span>
            </label>

            <button type="submit" className="ad-btn ad-btn--primary ad-login__submit" disabled={!email || !password || loading}>
              {loading ? (
                <>
                  <span className="ad-spinner" aria-hidden="true" />
                  {getTranslatedText('Signing in...')}
                </>
              ) : (
                <>
                  {getTranslatedText('Sign In')}
                  <Icon name="arrowUpRight" size={17} />
                </>
              )}
            </button>
          </form>

          <p className="ad-login__foot">
            <Icon name="shield" size={14} />
            {getTranslatedText('Secure admin access only')}
          </p>
        </motion.div>
      </main>
    </div>
  );
};

export default AdminLogin;
