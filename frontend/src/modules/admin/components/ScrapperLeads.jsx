import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useCallback, useRef } from 'react';
import { adminAPI } from '../../shared/utils/api';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import toast from 'react-hot-toast';
import {
  FaFileExcel,
  FaUpload,
  FaDownload,
  FaSearch,
  FaTruck,
  FaMapMarkerAlt,
  FaPhone,
  FaTrash,
  FaCheckCircle,
  FaClock,
  FaTimes,
  FaLayerGroup,
  FaUsers,
  FaBolt,
  FaBullhorn,
  FaInfoCircle
} from 'react-icons/fa';

// Debounce helper
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

const ScrapperLeads = () => {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, unassigned: 0, assigned: 0, completed: 0 });
  const [scrappers, setScrappers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [statusFilter, setStatusFilter] = useState('all'); // all | unassigned | assigned | completed
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Selection
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [bulkScrapperId, setBulkScrapperId] = useState('');

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [distributionMode, setDistributionMode] = useState('automatic'); // 'automatic' | 'manual' | 'single_scrapper'
  const [singleScrapperId, setSingleScrapperId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [selectedLeadDetails, setSelectedLeadDetails] = useState(null);

  const fileInputRef = useRef(null);

  const { getTranslatedText } = usePageTranslation([
    "Meta Leads & Ad Distribution",
    "Upload Meta Leads (.xlsx / .csv)",
    "Download Meta Excel Template",
    "Automatic Distribution",
    "Manual Distribution",
    "Assign to Scrapper",
    "Unassigned",
    "Assigned",
    "Completed"
  ]);

  // Load Active Scrappers dynamically
  const fetchScrappers = useCallback(async () => {
    try {
      const res = await adminAPI.getActiveScrappersForDistribution();
      if (res?.data?.scrappers) {
        setScrappers(res.data.scrappers);
      }
    } catch (err) {
      console.error('Failed to load scrappers:', err);
    }
  }, []);

  // Load Leads with filters
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: '25'
      });
      if (statusFilter !== 'all') queryParams.append('status', statusFilter);
      if (debouncedSearch) queryParams.append('search', debouncedSearch);

      const res = await adminAPI.getMetaLeads(queryParams.toString());
      if (res?.data?.leads) {
        setLeads(res.data.leads);
        if (res.data.stats) setStats(res.data.stats);
        if (res.data.pagination) setTotalPages(res.data.pagination.pages || 1);
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
      toast.error('Failed to load Meta leads');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchScrappers();
  }, [fetchScrappers]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Handle select all checkbox
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedLeads(leads.map(l => l._id));
    } else {
      setSelectedLeads([]);
    }
  };

  const handleToggleLead = (id) => {
    setSelectedLeads(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Trigger Template Download
  const handleDownloadTemplate = () => {
    window.location.href = '/api/v1/admin/leads/template';
  };

  // Preview / Analyze File
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadFile(file);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('distributionMode', 'preview');

    try {
      const res = await adminAPI.uploadMetaLeads(formData);
      if (res?.data) {
        setPreviewData(res.data);
      }
    } catch (err) {
      console.error('File preview error:', err);
      toast.error('Could not preview file: ' + (err.message || 'Invalid format'));
    }
  };

  // Submit Upload & Distribution
  const handleUploadSubmit = async () => {
    if (!uploadFile) {
      toast.error('Please select an Excel or CSV file');
      return;
    }

    if (distributionMode === 'single_scrapper' && !singleScrapperId) {
      toast.error('Please choose a scrapper to assign the leads to');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);

    if (distributionMode === 'single_scrapper') {
      formData.append('distributionMode', 'manual');
      formData.append('targetScrapperId', singleScrapperId);
    } else {
      formData.append('distributionMode', distributionMode);
    }

    try {
      const res = await adminAPI.uploadMetaLeads(formData);
      toast.success(res.message || 'Leads uploaded and distributed successfully!');
      setShowUploadModal(false);
      setUploadFile(null);
      setPreviewData(null);
      fetchLeads();
      fetchScrappers();
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error(err.message || 'Failed to upload leads');
    } finally {
      setUploading(false);
    }
  };

  // Bulk Distribute
  const handleBulkDistribute = async (mode, scrapperId = null) => {
    if (selectedLeads.length === 0) {
      toast.error('Please select at least one lead');
      return;
    }

    if (mode === 'manual' && !scrapperId) {
      toast.error('Please select a scrapper');
      return;
    }

    const toastId = toast.loading('Distributing leads to partner apps...');
    try {
      const res = await adminAPI.distributeMetaLeads({
        leadIds: selectedLeads,
        distributionMode: mode,
        scrapperId: scrapperId || undefined
      });
      toast.success(res.message || 'Leads distributed successfully!', { id: toastId });
      setSelectedLeads([]);
      setBulkScrapperId('');
      fetchLeads();
      fetchScrappers();
    } catch (err) {
      console.error('Distribution error:', err);
      toast.error(err.message || 'Failed to distribute leads', { id: toastId });
    }
  };

  // Single Row Quick Assign
  const handleSingleAssign = async (leadId, scrapperId) => {
    if (!scrapperId) return;
    const toastId = toast.loading('Assigning lead...');
    try {
      await adminAPI.distributeMetaLeads({
        leadIds: [leadId],
        distributionMode: 'manual',
        scrapperId
      });
      toast.success('Lead assigned & sent to scrapper app!', { id: toastId });
      fetchLeads();
    } catch (err) {
      toast.error(err.message || 'Assignment failed', { id: toastId });
    }
  };

  // Delete Lead
  const handleDeleteLead = async (id) => {
    if (!window.confirm('Delete this Meta lead? If an order was created, it will be cancelled.')) return;
    try {
      await adminAPI.deleteMetaLead(id);
      toast.success('Lead deleted successfully');
      fetchLeads();
    } catch (err) {
      toast.error(err.message || 'Failed to delete lead');
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
            <FaBullhorn className="text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Meta Leads & Distribution Center
            </h1>
            <p className="text-sm font-medium text-gray-500 mt-1">
              Upload Meta Lead Ads (Facebook/Instagram) Excel/CSV sheets and auto-dispatch orders straight to scrapper apps.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 font-bold text-sm shadow-sm transition-all"
          >
            <FaDownload className="text-indigo-600" />
            <span>Download Meta Template</span>
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-sm shadow-md hover:shadow-indigo-200 transition-all cursor-pointer"
          >
            <FaUpload />
            <span>Upload Meta Leads</span>
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
            <FaLayerGroup />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Leads</p>
            <p className="text-2xl font-black text-gray-900">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
            <FaClock />
          </div>
          <div>
            <p className="text-xs font-bold text-amber-500 uppercase tracking-wider">Unassigned (Pending)</p>
            <p className="text-2xl font-black text-amber-600">{stats.unassigned}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-bold">
            <FaTruck />
          </div>
          <div>
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Assigned to Apps</p>
            <p className="text-2xl font-black text-indigo-600">{stats.assigned}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">
            <FaCheckCircle />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Pickups Completed</p>
            <p className="text-2xl font-black text-emerald-600">{stats.completed}</p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <FaSearch className="absolute left-3.5 top-3.5 text-gray-400 text-sm" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search customer, phone, address, city, or campaign..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium"
          />
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 bg-gray-50 p-1.5 rounded-xl border border-gray-100 overflow-x-auto">
          {[
            { id: 'all', label: 'All Leads' },
            { id: 'unassigned', label: `Unassigned (${stats.unassigned})` },
            { id: 'assigned', label: `Assigned (${stats.assigned})` },
            { id: 'completed', label: `Completed (${stats.completed})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setStatusFilter(tab.id); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sticky Bulk Action Bar */}
      <AnimatePresence>
        {selectedLeads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-indigo-900 text-white p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <span className="h-8 w-8 rounded-full bg-indigo-800 flex items-center justify-center font-black text-sm">
                {selectedLeads.length}
              </span>
              <span className="font-bold text-sm">Leads Selected for Bulk Action</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={bulkScrapperId}
                onChange={(e) => setBulkScrapperId(e.target.value)}
                className="bg-indigo-800 text-white text-xs font-bold px-3 py-2 rounded-xl border border-indigo-700 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <option value="">Select Scrapper for Manual Assign...</option>
                {scrappers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone}) {s.isOnline ? '🟢 Online' : ''}
                  </option>
                ))}
              </select>

              <button
                onClick={() => handleBulkDistribute('manual', bulkScrapperId)}
                disabled={!bulkScrapperId}
                className="px-4 py-2 rounded-xl bg-white text-indigo-900 font-black text-xs hover:bg-indigo-50 disabled:opacity-50 transition-all cursor-pointer"
              >
                Assign to Selected Scrapper
              </button>

              <button
                onClick={() => handleBulkDistribute('automatic')}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs flex items-center gap-2 shadow transition-all cursor-pointer"
              >
                <FaBolt />
                <span>Auto-Distribute Across All Active Scrappers</span>
              </button>

              <button
                onClick={() => setSelectedLeads([])}
                className="px-3 py-2 rounded-xl bg-indigo-800 hover:bg-indigo-700 text-xs font-bold text-indigo-200"
              >
                Clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/75 border-b border-gray-100 text-[11px] font-black uppercase tracking-wider text-gray-500">
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selectedLeads.length === leads.length}
                    onChange={handleSelectAll}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                </th>
                <th className="p-4">Customer Details</th>
                <th className="p-4">Pickup Address</th>
                <th className="p-4">Scrap Info</th>
                <th className="p-4">Meta Campaign / Ad</th>
                <th className="p-4">Status</th>
                <th className="p-4">Assigned Scrapper</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm font-medium">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-12 text-center text-gray-400">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                    <p className="font-bold">Loading Meta Leads...</p>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-12 text-center text-gray-400">
                    <FaFileExcel className="mx-auto text-4xl mb-3 text-gray-300" />
                    <p className="font-bold text-gray-600">No Meta Leads Found</p>
                    <p className="text-xs text-gray-400 mt-1">Upload a Meta Excel/CSV file to distribute leads directly to scrappers.</p>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const isSelected = selectedLeads.includes(lead._id);
                  return (
                    <tr
                      key={lead._id}
                      className={`hover:bg-gray-50/60 transition-colors ${
                        isSelected ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleLead(lead._id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        />
                      </td>

                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-black text-gray-900">{lead.name}</span>
                          <a
                            href={`tel:${lead.phone}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 mt-0.5"
                          >
                            <FaPhone className="text-[10px]" />
                            <span>+91 {lead.phone}</span>
                          </a>
                          {lead.email ? (
                            <span className="text-[11px] text-gray-400 truncate max-w-[150px]">{lead.email}</span>
                          ) : null}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="flex items-start gap-1.5 max-w-xs">
                          <FaMapMarkerAlt className="text-gray-400 text-xs mt-1 shrink-0" />
                          <div className="flex flex-col text-xs">
                            <span className="text-gray-800 font-semibold line-clamp-2">{lead.address}</span>
                            <span className="text-gray-400 font-bold mt-0.5">{lead.city} {lead.pincode ? `· ${lead.pincode}` : ''}</span>
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="flex flex-col text-xs">
                          <span className="font-bold text-gray-900">{lead.scrapType || 'Mixed Scrap'}</span>
                          <span className="text-gray-500 font-semibold mt-0.5">
                            Est: <strong className="text-gray-900">{lead.estimatedWeight || 10} kg</strong>
                          </span>
                          {lead.preferredDate ? (
                            <span className="text-[11px] text-indigo-600 font-bold mt-0.5">Slot: {lead.preferredDate}</span>
                          ) : null}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="flex flex-col text-xs max-w-xs">
                          <span className="font-bold text-gray-800 truncate">{lead.campaignName || 'Meta Lead Ads'}</span>
                          {lead.adName ? <span className="text-gray-400 text-[11px] truncate">Ad: {lead.adName}</span> : null}
                          {lead.uploadBatch ? (
                            <span className="text-[10px] text-gray-400 font-mono mt-0.5">Batch: {lead.uploadBatch}</span>
                          ) : null}
                        </div>
                      </td>

                      <td className="p-4">
                        {lead.status === 'unassigned' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-600 border border-amber-200">
                            <FaClock className="text-[10px]" />
                            <span>Unassigned</span>
                          </span>
                        ) : lead.status === 'assigned' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-indigo-50 text-indigo-600 border border-indigo-200">
                            <FaTruck className="text-[10px]" />
                            <span>Assigned</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-600 border border-emerald-200">
                            <FaCheckCircle className="text-[10px]" />
                            <span>Completed</span>
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        {lead.assignedScrapper ? (
                          <div className="flex flex-col text-xs">
                            <span className="font-black text-gray-900">{lead.assignedScrapper.name}</span>
                            <span className="text-gray-500 font-bold mt-0.5">Ph: {lead.assignedScrapper.phone}</span>
                            {lead.assignedOrder?.orderNo ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-600 mt-1">
                                Order #{lead.assignedOrder.orderNo}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              defaultValue=""
                              onChange={(e) => handleSingleAssign(lead._id, e.target.value)}
                              className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                            >
                              <option value="">Assign Scrapper...</option>
                              {scrappers.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.phone})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedLeadDetails(lead)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="View Raw Lead Details"
                          >
                            <FaInfoCircle className="text-sm" />
                          </button>
                          <button
                            onClick={() => handleDeleteLead(lead._id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete Lead"
                          >
                            <FaTrash className="text-xs" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload & Distribute Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
                    <FaFileExcel />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Upload & Distribute Meta Leads</h3>
                    <p className="text-xs text-gray-500">Upload Meta Ads export (.xlsx, .xls, .csv)</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="space-y-5 mt-5">
                {/* File Dropzone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/30 rounded-2xl p-6 text-center cursor-pointer transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <FaUpload className="mx-auto text-3xl text-indigo-500 mb-2" />
                  {uploadFile ? (
                    <div>
                      <p className="font-black text-gray-900">{uploadFile.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{(uploadFile.size / 1024).toFixed(1)} KB · Ready to parse</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-bold text-gray-700 text-sm">Click to choose or drag & drop Meta Excel/CSV file</p>
                      <p className="text-xs text-gray-400 mt-1">Supports Meta Lead Ads export (.xlsx, .xls, .csv)</p>
                    </div>
                  )}
                </div>

                {/* Preview Stats */}
                {previewData && (
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-gray-500">Total Rows:</span> <strong className="text-gray-900">{previewData.totalRows}</strong>
                    </div>
                    <div>
                      <span className="text-emerald-600">Valid Leads:</span> <strong className="text-emerald-700">{previewData.validCount}</strong>
                    </div>
                    {previewData.invalidCount > 0 && (
                      <div>
                        <span className="text-red-500">Skipped (Invalid):</span> <strong className="text-red-600">{previewData.invalidCount}</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Distribution Mode Options */}
                <div className="space-y-3">
                  <label className="text-xs font-black text-gray-700 uppercase tracking-wider block">
                    Choose Distribution Mode:
                  </label>

                  {/* Option 1: Automatic */}
                  <label
                    className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                      distributionMode === 'automatic'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="distMode"
                      value="automatic"
                      checked={distributionMode === 'automatic'}
                      onChange={() => setDistributionMode('automatic')}
                      className="mt-1 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-gray-900 text-sm">⚡ Automatic Distribution</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        System automatically divides leads evenly (round-robin) across all active scrappers. Pickups appear on their phone apps instantly!
                      </p>
                    </div>
                  </label>

                  {/* Option 2: Manual */}
                  <label
                    className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                      distributionMode === 'manual'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="distMode"
                      value="manual"
                      checked={distributionMode === 'manual'}
                      onChange={() => setDistributionMode('manual')}
                      className="mt-1 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <span className="font-black text-gray-900 text-sm">🎯 Manual Distribution (Review First)</span>
                      <p className="text-xs text-gray-500 mt-1">
                        Saves all leads as unassigned. You can inspect leads in the table and assign them individually or in bulk to specific scrappers.
                      </p>
                    </div>
                  </label>

                  {/* Option 3: Assign All to One */}
                  <label
                    className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                      distributionMode === 'single_scrapper'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="distMode"
                      value="single_scrapper"
                      checked={distributionMode === 'single_scrapper'}
                      onChange={() => setDistributionMode('single_scrapper')}
                      className="mt-1 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <span className="font-black text-gray-900 text-sm">👤 Assign All to One Dedicated Scrapper</span>
                      <p className="text-xs text-gray-500 mt-1">
                        Assign the entire uploaded batch to a single chosen scrapper.
                      </p>

                      {distributionMode === 'single_scrapper' && (
                        <div className="mt-3">
                          <select
                            value={singleScrapperId}
                            onChange={(e) => setSingleScrapperId(e.target.value)}
                            className="w-full text-xs font-bold border border-indigo-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Scrapper...</option>
                            {scrappers.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.phone}) {s.isOnline ? '🟢 Online' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </label>
                </div>

                {/* Submit Action */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleUploadSubmit}
                    disabled={!uploadFile || uploading}
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Processing & Distributing...</span>
                      </>
                    ) : (
                      <>
                        <FaBolt />
                        <span>Upload & Distribute Now</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lead Details Modal */}
      <AnimatePresence>
        {selectedLeadDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <h3 className="text-lg font-black text-gray-900">Meta Lead Details</h3>
                <button
                  onClick={() => setSelectedLeadDetails(null)}
                  className="p-2 rounded-xl text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="space-y-4 mt-4 text-xs">
                <div>
                  <span className="font-bold text-gray-400 uppercase">Customer</span>
                  <p className="text-sm font-black text-gray-900">{selectedLeadDetails.name}</p>
                  <p className="text-gray-600">+91 {selectedLeadDetails.phone}</p>
                </div>

                <div>
                  <span className="font-bold text-gray-400 uppercase">Address</span>
                  <p className="text-gray-900 font-semibold">{selectedLeadDetails.address}, {selectedLeadDetails.city} {selectedLeadDetails.pincode}</p>
                </div>

                <div>
                  <span className="font-bold text-gray-400 uppercase">Scrap Request</span>
                  <p className="text-gray-900 font-semibold">{selectedLeadDetails.scrapType} (~{selectedLeadDetails.estimatedWeight} kg)</p>
                  {selectedLeadDetails.notes && <p className="text-gray-500 italic mt-0.5">"{selectedLeadDetails.notes}"</p>}
                </div>

                <div>
                  <span className="font-bold text-gray-400 uppercase">Meta Ad Attribution</span>
                  <p className="text-gray-800">Campaign: <strong>{selectedLeadDetails.campaignName || 'N/A'}</strong></p>
                  {selectedLeadDetails.adName && <p className="text-gray-600">Ad: {selectedLeadDetails.adName}</p>}
                  {selectedLeadDetails.uploadBatch && <p className="text-gray-500 font-mono">Batch: {selectedLeadDetails.uploadBatch}</p>}
                </div>

                {selectedLeadDetails.rawDetails && (
                  <div>
                    <span className="font-bold text-gray-400 uppercase">Raw Meta Row Fields</span>
                    <pre className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-[11px] font-mono text-gray-700 max-h-36 overflow-y-auto">
                      {JSON.stringify(selectedLeadDetails.rawDetails, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedLeadDetails(null)}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ScrapperLeads;
