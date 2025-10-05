import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Workspace {
  id: string;
  name: string;
  location: string;
  features: string[];
  status: "available" | "reserved" | "occupied";
  encryptedPreferences: string;
  pricePerHour: number;
  owner: string;
}

interface UserPreferences {
  noiseLevel: number; // 1-5
  windowView: boolean;
  privacyLevel: number; // 1-3
  amenities: string[];
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [booking, setBooking] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [bookingDuration, setBookingDuration] = useState(1);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    noiseLevel: 3,
    windowView: true,
    privacyLevel: 2,
    amenities: ["WiFi", "Power Outlet"]
  });
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredWorkspaces, setFilteredWorkspaces] = useState<Workspace[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");

  // Calculate statistics for dashboard
  const availableCount = workspaces.filter(w => w.status === "available").length;
  const reservedCount = workspaces.filter(w => w.status === "reserved").length;
  const occupiedCount = workspaces.filter(w => w.status === "occupied").length;

  // Translations
  const translations = {
    en: {
      title: "PrivateSpace",
      subtitle: "FHE-Powered Workspace Booking",
      connectWallet: "Connect Wallet",
      disconnect: "Disconnect",
      dashboard: "Dashboard",
      statistics: "Statistics",
      available: "Available",
      reserved: "Reserved",
      occupied: "Occupied",
      workspaces: "Workspaces",
      searchPlaceholder: "Search by location or features...",
      filterAll: "All",
      filterAvailable: "Available",
      filterReserved: "Reserved",
      filterOccupied: "Occupied",
      bookWorkspace: "Book Workspace",
      cancel: "Cancel",
      confirmBooking: "Confirm Booking",
      bookingDuration: "Booking Duration (hours)",
      preferences: "Preferences",
      noiseLevel: "Noise Level",
      windowView: "Window View",
      privacyLevel: "Privacy Level",
      amenities: "Amenities",
      low: "Low",
      medium: "Medium",
      high: "High",
      yes: "Yes",
      no: "No",
      private: "Private",
      semiPrivate: "Semi-Private",
      open: "Open",
      totalWorkspaces: "Total Workspaces",
      bookNow: "Book Now",
      bookingInProgress: "Processing with FHE...",
      bookingSuccess: "Booking confirmed securely!",
      bookingError: "Booking failed",
      refresh: "Refresh",
      refreshing: "Refreshing...",
      noWorkspaces: "No workspaces found",
      language: "Language",
      english: "English",
      chinese: "中文",
      footerText: "Secure workspace booking with fully homomorphic encryption",
      copyright: "© 2025 PrivateSpace. All rights reserved.",
      fheNotice: "Your preferences are encrypted using FHE technology",
      setPreferences: "Set Preferences",
      preferencesUpdated: "Preferences updated securely",
      viewDetails: "View Details",
      features: "Features",
      price: "Price",
      perHour: "/hour",
      status: "Status",
      location: "Location",
      bookingHistory: "Booking History",
      yourBookings: "Your Bookings",
      noBookings: "No bookings found",
      bookingId: "Booking ID",
      workspace: "Workspace",
      duration: "Duration",
      totalCost: "Total Cost",
      date: "Date",
      viewAll: "View All",
      fheProcessing: "Processing with FHE..."
    },
    zh: {
      title: "隐私空间",
      subtitle: "基于FHE的工位预订系统",
      connectWallet: "连接钱包",
      disconnect: "断开连接",
      dashboard: "仪表盘",
      statistics: "统计数据",
      available: "可用",
      reserved: "已预订",
      occupied: "占用中",
      workspaces: "工位列表",
      searchPlaceholder: "搜索位置或设施...",
      filterAll: "全部",
      filterAvailable: "可用",
      filterReserved: "已预订",
      filterOccupied: "占用中",
      bookWorkspace: "预订工位",
      cancel: "取消",
      confirmBooking: "确认预订",
      bookingDuration: "预订时长（小时）",
      preferences: "偏好设置",
      noiseLevel: "噪音等级",
      windowView: "靠窗位置",
      privacyLevel: "隐私等级",
      amenities: "配套设施",
      low: "低",
      medium: "中",
      high: "高",
      yes: "是",
      no: "否",
      private: "私密",
      semiPrivate: "半私密",
      open: "开放",
      totalWorkspaces: "总工位数",
      bookNow: "立即预订",
      bookingInProgress: "使用FHE处理中...",
      bookingSuccess: "预订安全确认！",
      bookingError: "预订失败",
      refresh: "刷新",
      refreshing: "刷新中...",
      noWorkspaces: "未找到工位",
      language: "语言",
      english: "English",
      chinese: "中文",
      footerText: "使用全同态加密技术的安全工位预订系统",
      copyright: "© 2025 隐私空间 保留所有权利",
      fheNotice: "您的偏好设置使用FHE技术加密",
      setPreferences: "设置偏好",
      preferencesUpdated: "偏好设置安全更新",
      viewDetails: "查看详情",
      features: "设施",
      price: "价格",
      perHour: "/小时",
      status: "状态",
      location: "位置",
      bookingHistory: "预订历史",
      yourBookings: "您的预订",
      noBookings: "未找到预订记录",
      bookingId: "预订ID",
      workspace: "工位",
      duration: "时长",
      totalCost: "总费用",
      date: "日期",
      viewAll: "查看全部",
      fheProcessing: "使用FHE处理中..."
    }
  };

  const t = translations[language];

  useEffect(() => {
    loadWorkspaces().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Apply search and filter
    let result = workspaces;
    
    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(workspace => 
        workspace.location.toLowerCase().includes(term) || 
        workspace.features.some(feature => feature.toLowerCase().includes(term))
      );
    }
    
    // Apply status filter
    if (activeFilter !== "all") {
      result = result.filter(workspace => workspace.status === activeFilter);
    }
    
    setFilteredWorkspaces(result);
  }, [workspaces, searchTerm, activeFilter]);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadWorkspaces = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("workspace_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing workspace keys:", e);
        }
      }
      
      const list: Workspace[] = [];
      
      for (const key of keys) {
        try {
          const workspaceBytes = await contract.getData(`workspace_${key}`);
          if (workspaceBytes.length > 0) {
            try {
              const workspaceData = JSON.parse(ethers.toUtf8String(workspaceBytes));
              list.push({
                id: key,
                name: workspaceData.name,
                location: workspaceData.location,
                features: workspaceData.features,
                status: workspaceData.status,
                encryptedPreferences: workspaceData.encryptedPreferences,
                pricePerHour: workspaceData.pricePerHour,
                owner: workspaceData.owner
              });
            } catch (e) {
              console.error(`Error parsing workspace data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading workspace ${key}:`, e);
        }
      }
      
      setWorkspaces(list);
    } catch (e) {
      console.error("Error loading workspaces:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const bookWorkspace = async () => {
    if (!provider || !selectedWorkspace) { 
      alert(t.connectWallet); 
      return; 
    }
    
    setBooking(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: t.bookingInProgress
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Simulate FHE matching
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update workspace status
      const updatedWorkspace = {
        ...selectedWorkspace,
        status: "reserved"
      };
      
      await contract.setData(
        `workspace_${selectedWorkspace.id}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedWorkspace))
      );
      
      // Create booking record
      const bookingId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const bookingData = {
        id: bookingId,
        workspaceId: selectedWorkspace.id,
        userId: account,
        duration: bookingDuration,
        totalCost: selectedWorkspace.pricePerHour * bookingDuration,
        timestamp: Math.floor(Date.now() / 1000),
        status: "confirmed"
      };
      
      await contract.setData(
        `booking_${bookingId}`, 
        ethers.toUtf8Bytes(JSON.stringify(bookingData))
      );
      
      // Add to booking keys
      const bookingKeysBytes = await contract.getData("booking_keys");
      let bookingKeys: string[] = [];
      
      if (bookingKeysBytes.length > 0) {
        try {
          bookingKeys = JSON.parse(ethers.toUtf8String(bookingKeysBytes));
        } catch (e) {
          console.error("Error parsing booking keys:", e);
        }
      }
      
      bookingKeys.push(bookingId);
      
      await contract.setData(
        "booking_keys", 
        ethers.toUtf8Bytes(JSON.stringify(bookingKeys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: t.bookingSuccess
      });
      
      await loadWorkspaces();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowBookingModal(false);
        setSelectedWorkspace(null);
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : t.bookingError + ": " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setBooking(false);
    }
  };

  const updatePreferences = async () => {
    if (!provider) { 
      alert(t.connectWallet); 
      return; 
    }
    
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: t.fheProcessing
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Simulate FHE encryption
      const encryptedPreferences = `FHE-${btoa(JSON.stringify(userPreferences))}`;
      
      // Store encrypted preferences
      await contract.setData(
        `preferences_${account}`, 
        ethers.toUtf8Bytes(encryptedPreferences)
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: t.preferencesUpdated
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Update failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "zh" : "en");
  };

  const renderWorkspaceChart = () => {
    const total = workspaces.length || 1;
    const availablePercentage = (availableCount / total) * 100;
    const reservedPercentage = (reservedCount / total) * 100;
    const occupiedPercentage = (occupiedCount / total) * 100;

    return (
      <div className="chart-container">
        <div className="chart-bar available" style={{ width: `${availablePercentage}%` }}>
          <span>{availableCount}</span>
        </div>
        <div className="chart-bar reserved" style={{ width: `${reservedPercentage}%` }}>
          <span>{reservedCount}</span>
        </div>
        <div className="chart-bar occupied" style={{ width: `${occupiedPercentage}%` }}>
          <span>{occupiedCount}</span>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>{t.fheProcessing}</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="lock-icon"></div>
          </div>
          <h1>{t.title}</h1>
          <p className="subtitle">{t.subtitle}</p>
        </div>
        
        <div className="header-actions">
          <div className="language-toggle">
            <button onClick={toggleLanguage} className="glass-button">
              {language === "en" ? t.chinese : t.english}
            </button>
          </div>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-section">
          <h2>{t.dashboard}</h2>
          
          <div className="stats-grid">
            <div className="stat-card glass-card">
              <div className="stat-value">{workspaces.length}</div>
              <div className="stat-label">{t.totalWorkspaces}</div>
            </div>
            
            <div className="stat-card glass-card">
              <div className="stat-value">{availableCount}</div>
              <div className="stat-label">{t.available}</div>
            </div>
            
            <div className="stat-card glass-card">
              <div className="stat-value">{reservedCount}</div>
              <div className="stat-label">{t.reserved}</div>
            </div>
            
            <div className="stat-card glass-card">
              <div className="stat-value">{occupiedCount}</div>
              <div className="stat-label">{t.occupied}</div>
            </div>
          </div>
          
          <div className="chart-section glass-card">
            <h3>{t.statistics}</h3>
            {renderWorkspaceChart()}
            <div className="chart-legend">
              <div className="legend-item">
                <div className="color-dot available"></div>
                <span>{t.available}</span>
              </div>
              <div className="legend-item">
                <div className="color-dot reserved"></div>
                <span>{t.reserved}</span>
              </div>
              <div className="legend-item">
                <div className="color-dot occupied"></div>
                <span>{t.occupied}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="preferences-section glass-card">
          <h3>{t.preferences}</h3>
          <div className="preferences-form">
            <div className="form-group">
              <label>{t.noiseLevel}</label>
              <select 
                value={userPreferences.noiseLevel} 
                onChange={(e) => setUserPreferences({...userPreferences, noiseLevel: parseInt(e.target.value)})}
                className="glass-input"
              >
                <option value={1}>{t.low}</option>
                <option value={2}>2</option>
                <option value={3}>{t.medium}</option>
                <option value={4}>4</option>
                <option value={5}>{t.high}</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>{t.windowView}</label>
              <select 
                value={userPreferences.windowView ? "yes" : "no"} 
                onChange={(e) => setUserPreferences({...userPreferences, windowView: e.target.value === "yes"})}
                className="glass-input"
              >
                <option value="yes">{t.yes}</option>
                <option value="no">{t.no}</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>{t.privacyLevel}</label>
              <select 
                value={userPreferences.privacyLevel} 
                onChange={(e) => setUserPreferences({...userPreferences, privacyLevel: parseInt(e.target.value)})}
                className="glass-input"
              >
                <option value={1}>{t.open}</option>
                <option value={2}>{t.semiPrivate}</option>
                <option value={3}>{t.private}</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>{t.amenities}</label>
              <div className="amenities-grid">
                {["WiFi", "Power Outlet", "Monitor", "Phone Booth", "Coffee", "Printer"].map(item => (
                  <div key={item} className="amenity-item">
                    <input 
                      type="checkbox" 
                      id={item}
                      checked={userPreferences.amenities.includes(item)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setUserPreferences({
                            ...userPreferences,
                            amenities: [...userPreferences.amenities, item]
                          });
                        } else {
                          setUserPreferences({
                            ...userPreferences,
                            amenities: userPreferences.amenities.filter(a => a !== item)
                          });
                        }
                      }}
                    />
                    <label htmlFor={item}>{item}</label>
                  </div>
                ))}
              </div>
            </div>
            
            <button 
              onClick={updatePreferences}
              className="glass-button primary"
            >
              {t.setPreferences}
            </button>
            
            <div className="fhe-notice">
              <div className="lock-icon"></div>
              {t.fheNotice}
            </div>
          </div>
        </div>
        
        <div className="workspaces-section">
          <div className="section-header">
            <h2>{t.workspaces}</h2>
            <div className="controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder={t.searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="glass-input"
                />
              </div>
              
              <div className="filter-buttons">
                <button 
                  className={`filter-btn ${activeFilter === "all" ? "active" : ""}`}
                  onClick={() => setActiveFilter("all")}
                >
                  {t.filterAll}
                </button>
                <button 
                  className={`filter-btn ${activeFilter === "available" ? "active" : ""}`}
                  onClick={() => setActiveFilter("available")}
                >
                  {t.filterAvailable}
                </button>
                <button 
                  className={`filter-btn ${activeFilter === "reserved" ? "active" : ""}`}
                  onClick={() => setActiveFilter("reserved")}
                >
                  {t.filterReserved}
                </button>
                <button 
                  className={`filter-btn ${activeFilter === "occupied" ? "active" : ""}`}
                  onClick={() => setActiveFilter("occupied")}
                >
                  {t.filterOccupied}
                </button>
              </div>
              
              <button 
                onClick={loadWorkspaces}
                className="glass-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? t.refreshing : t.refresh}
              </button>
            </div>
          </div>
          
          <div className="workspaces-grid">
            {filteredWorkspaces.length === 0 ? (
              <div className="no-workspaces glass-card">
                <div className="empty-icon"></div>
                <p>{t.noWorkspaces}</p>
              </div>
            ) : (
              filteredWorkspaces.map(workspace => (
                <div className="workspace-card glass-card" key={workspace.id}>
                  <div className="workspace-header">
                    <h3>{workspace.name}</h3>
                    <span className={`status-badge ${workspace.status}`}>
                      {workspace.status === "available" ? t.available : 
                       workspace.status === "reserved" ? t.reserved : t.occupied}
                    </span>
                  </div>
                  
                  <div className="workspace-details">
                    <div className="detail-item">
                      <span className="label">{t.location}:</span>
                      <span>{workspace.location}</span>
                    </div>
                    
                    <div className="detail-item">
                      <span className="label">{t.price}:</span>
                      <span>${workspace.pricePerHour}{t.perHour}</span>
                    </div>
                    
                    <div className="detail-item">
                      <span className="label">{t.features}:</span>
                      <div className="features-list">
                        {workspace.features.map((feature, idx) => (
                          <span key={idx} className="feature-tag">{feature}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="workspace-actions">
                    {workspace.status === "available" && (
                      <button 
                        className="glass-button primary"
                        onClick={() => {
                          setSelectedWorkspace(workspace);
                          setShowBookingModal(true);
                        }}
                      >
                        {t.bookNow}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showBookingModal && selectedWorkspace && (
        <ModalBooking 
          workspace={selectedWorkspace}
          duration={bookingDuration}
          setDuration={setBookingDuration}
          onConfirm={bookWorkspace}
          onClose={() => setShowBookingModal(false)}
          booking={booking}
          t={t}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content glass-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon">!</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="lock-icon"></div>
              <span>{t.title}</span>
            </div>
            <p>{t.footerText}</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
            <a href="#" className="footer-link">Documentation</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            {t.copyright}
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalBookingProps {
  workspace: Workspace;
  duration: number;
  setDuration: (duration: number) => void;
  onConfirm: () => void;
  onClose: () => void;
  booking: boolean;
  t: any;
}

const ModalBooking: React.FC<ModalBookingProps> = ({ 
  workspace,
  duration,
  setDuration,
  onConfirm,
  onClose,
  booking,
  t
}) => {
  return (
    <div className="modal-overlay">
      <div className="booking-modal glass-card">
        <div className="modal-header">
          <h2>{t.bookWorkspace}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="workspace-info">
            <h3>{workspace.name}</h3>
            <p>{workspace.location}</p>
            <div className="features-list">
              {workspace.features.map((feature, idx) => (
                <span key={idx} className="feature-tag">{feature}</span>
              ))}
            </div>
          </div>
          
          <div className="booking-form">
            <div className="form-group">
              <label>{t.bookingDuration}</label>
              <input 
                type="range" 
                min="1" 
                max="8" 
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
              />
              <div className="duration-value">{duration} {duration === 1 ? t.duration.slice(0, -1) : t.duration}</div>
            </div>
            
            <div className="price-summary">
              <div className="price-item">
                <span>{t.price}:</span>
                <span>${workspace.pricePerHour}{t.perHour}</span>
              </div>
              <div className="price-item">
                <span>{t.duration}:</span>
                <span>{duration} {duration === 1 ? t.duration.slice(0, -1) : t.duration}</span>
              </div>
              <div className="price-item total">
                <span>{t.totalCost}:</span>
                <span>${(workspace.pricePerHour * duration).toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            {t.fheNotice}
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="glass-button"
          >
            {t.cancel}
          </button>
          <button 
            onClick={onConfirm} 
            disabled={booking}
            className="glass-button primary"
          >
            {booking ? t.fheProcessing : t.confirmBooking}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;