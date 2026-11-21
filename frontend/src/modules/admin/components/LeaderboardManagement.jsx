import { motion } from 'framer-motion';
import { useState } from 'react';
import ReferralLeaderboard from '../../shared/components/ReferralLeaderboard';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import {
  FaTrophy,
  FaUsers,
  FaTruck,
  FaChartBar,
  FaDownload
} from 'react-icons/fa';

const LeaderboardManagement = () => {
  const [selectedType, setSelectedType] = useState('user'); // user, scrapper
  const [selectedPeriod, setSelectedPeriod] = useState('all'); // all, monthly

  const staticTexts = [
    "Export functionality will be implemented with backend integration",
    "Referral Leaderboard",
    "View top referrers and manage leaderboard settings",
    "Export",
    "User Type",
    "Users",
    "Scrappers",
    "Period",
    "All Time",
    "This Month",
    "Total Referrers",
    "Top Referrals",
    "Total Rewards Paid",
    "Top {type}"
  ];
  const { getTranslatedText } = usePageTranslation(staticTexts);

  const handleExport = () => {
    // In real app, this would export leaderboard data
    alert(getTranslatedText('Export functionality will be implemented with backend integration'));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-lg p-4 md:p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(var(--ad-primary-rgb), 0.1)' }}
            >
              <FaTrophy className="text-3xl" style={{ color: 'var(--ad-primary)' }} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: 'var(--ad-ink)' }}>
                {getTranslatedText("Referral Leaderboard")}
              </h1>
              <p className="text-sm md:text-base" style={{ color: 'var(--ad-muted)' }}>
                {getTranslatedText("View top referrers and manage leaderboard settings")}
              </p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleExport}
            className="px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all"
            style={{ backgroundColor: 'var(--ad-primary)', color: '#ffffff' }}
          >
            <FaDownload />
            {getTranslatedText("Export")}
          </motion.button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--ad-ink)' }}>
              {getTranslatedText("User Type")}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedType('user')}
                className={`flex-1 px-4 py-2 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${selectedType === 'user' ? 'shadow-md' : ''
                  }`}
                style={{
                  backgroundColor: selectedType === 'user' ? 'var(--ad-primary)' : 'var(--ad-surface-2)',
                  color: selectedType === 'user' ? '#ffffff' : 'var(--ad-ink)'
                }}
              >
                <FaUsers />
                {getTranslatedText("Users")}
              </button>
              <button
                onClick={() => setSelectedType('scrapper')}
                className={`flex-1 px-4 py-2 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${selectedType === 'scrapper' ? 'shadow-md' : ''
                  }`}
                style={{
                  backgroundColor: selectedType === 'scrapper' ? 'var(--ad-primary)' : 'var(--ad-surface-2)',
                  color: selectedType === 'scrapper' ? '#ffffff' : 'var(--ad-ink)'
                }}
              >
                <FaTruck />
                {getTranslatedText("Scrappers")}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--ad-ink)' }}>
              {getTranslatedText("Period")}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedPeriod('all')}
                className={`flex-1 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${selectedPeriod === 'all' ? 'shadow-md' : ''
                  }`}
                style={{
                  backgroundColor: selectedPeriod === 'all' ? 'var(--ad-primary)' : 'var(--ad-surface-2)',
                  color: selectedPeriod === 'all' ? '#ffffff' : 'var(--ad-ink)'
                }}
              >
                {getTranslatedText("All Time")}
              </button>
              <button
                onClick={() => setSelectedPeriod('monthly')}
                className={`flex-1 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${selectedPeriod === 'monthly' ? 'shadow-md' : ''
                  }`}
                style={{
                  backgroundColor: selectedPeriod === 'monthly' ? 'var(--ad-primary)' : 'var(--ad-surface-2)',
                  color: selectedPeriod === 'monthly' ? '#ffffff' : 'var(--ad-ink)'
                }}
              >
                {getTranslatedText("This Month")}
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Leaderboard Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div className="bg-white rounded-2xl shadow-lg p-4 md:p-6">
          <div className="flex items-center gap-3 mb-2">
            <FaUsers className="text-xl" style={{ color: 'var(--ad-primary)' }} />
            <p className="text-sm" style={{ color: 'var(--ad-muted)' }}>{getTranslatedText("Total Referrers")}</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--ad-ink)' }}>
            {/* This would be calculated from leaderboard data */}
            -
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-4 md:p-6">
          <div className="flex items-center gap-3 mb-2">
            <FaTrophy className="text-xl" style={{ color: 'var(--ad-primary)' }} />
            <p className="text-sm" style={{ color: 'var(--ad-muted)' }}>{getTranslatedText("Top Referrals")}</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--ad-ink)' }}>
            {/* This would be calculated from leaderboard data */}
            -
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-4 md:p-6">
          <div className="flex items-center gap-3 mb-2">
            <FaChartBar className="text-xl" style={{ color: 'var(--ad-primary)' }} />
            <p className="text-sm" style={{ color: 'var(--ad-muted)' }}>{getTranslatedText("Total Rewards Paid")}</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--ad-ink)' }}>
            {/* This would be calculated from leaderboard data */}
            -
          </p>
        </div>
      </motion.div>

      {/* Leaderboard */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl shadow-lg p-4 md:p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          {selectedType === 'user' ? (
            <FaUsers className="text-xl" style={{ color: 'var(--ad-primary)' }} />
          ) : (
            <FaTruck className="text-xl" style={{ color: 'var(--ad-primary)' }} />
          )}
          <h2 className="text-lg md:text-xl font-bold" style={{ color: 'var(--ad-ink)' }}>
            {getTranslatedText("Top {type}", { type: selectedType === 'user' ? getTranslatedText('Users') : getTranslatedText('Scrappers') })}
          </h2>
        </div>
        <ReferralLeaderboard userType={selectedType} period={selectedPeriod} />
      </motion.div>
    </div>
  );
};

export default LeaderboardManagement;

