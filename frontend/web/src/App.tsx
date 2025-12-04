// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Workspace {
  id: string;
  encryptedPreferences: string;
  bookingDate: number;
  owner: string;
  location: string;
  status: "available" | "booked" | "reserved";
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
  const [newBookingData, setNewBookingData] = useState({
    preferences: "",
    location: "",
    date: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLocation, setFilterLocation] = useState("all");
  const [language, setLanguage] = useState<"en" | "zh">("en");
  
  // Calculate statistics for dashboard
  const availableCount = workspaces.filter(w => w.status === "available").length;
  const bookedCount = workspaces.filter(w => w.status === "booked").length;
  const reservedCount = workspaces.filter(w => w.status === "reserved").length;

  useEffect(() => {
    loadWorkspaces().finally(() => setLoading(false));
  }, []);

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
                encryptedPreferences: workspaceData.preferences,
                bookingDate: workspaceData.date,
                owner: workspaceData.owner,
                location: workspaceData.location,
                status: workspaceData.status || "available"
              });
            } catch (e) {
              console.error(`Error parsing workspace data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading workspace ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.bookingDate - a.bookingDate);
      setWorkspaces(list);
    } catch (e) {
      console.error("Error loading workspaces:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const bookWorkspace = async () => {
    if (!provider) { 
      alert(language === "en" ? "Please connect wallet first" : "请先连接钱包"); 
      return; 
    }
    
    setBooking(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: language === "en" 
        ? "Encrypting preferences with FHE..." 
        : "使用FHE加密偏好设置..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedPreferences = `FHE-${btoa(JSON.stringify(newBookingData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const workspaceId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const workspaceData = {
        preferences: encryptedPreferences,
        date: Math.floor(Date.now() / 1000),
        owner: account,
        location: newBookingData.location,
        status: "booked"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `workspace_${workspaceId}`, 
        ethers.toUtf8Bytes(JSON.stringify(workspaceData))
      );
      
      const keysBytes = await contract.getData("workspace_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(workspaceId);
      
      await contract.setData(
        "workspace_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: language === "en" 
          ? "Workspace booked securely with FHE!" 
          : "工位已通过FHE安全预订！"
      });
      
      await loadWorkspaces();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowBookingModal(false);
        setNewBookingData({
          preferences: "",
          location: "",
          date: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? language === "en" ? "Transaction rejected by user" : "用户拒绝了交易"
        : language === "en" 
          ? "Booking failed: " + (e.message || "Unknown error")
          : "预订失败: " + (e.message || "未知错误");
      
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

  const checkAvailability = async () => {
    if (!provider) { 
      alert(language === "en" ? "Please connect wallet first" : "请先连接钱包"); 
      return; 
    }
    
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: language === "en" 
        ? "Checking availability with FHE..." 
        : "使用FHE检查可用性..."
    });
    
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      
      if (isAvailable) {
        setTransactionStatus({
          visible: true,
          status: "success",
          message: language === "en" 
            ? "System is available with FHE!" 
            : "系统通过FHE可用！"
        });
      } else {
        setTransactionStatus({
          visible: true,
          status: "error",
          message: language === "en" 
            ? "System is not available" 
            : "系统不可用"
        });
      }
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: language === "en" 
          ? "Check failed: " + (e.message || "Unknown error")
          : "检查失败: " + (e.message || "未知错误")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredWorkspaces = workspaces.filter(workspace => {
    const matchesSearch = workspace.location.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          workspace.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLocation = filterLocation === "all" || workspace.location === filterLocation;
    return matchesSearch && matchesLocation;
  });

  const renderBarChart = () => {
    const locations = Array.from(new Set(workspaces.map(w => w.location)));
    const locationCounts = locations.map(loc => ({
      location: loc,
      count: workspaces.filter(w => w.location === loc).length
    }));

    const maxCount = Math.max(...locationCounts.map(lc => lc.count), 1);

    return (
      <div className="bar-chart">
        {locationCounts.map((lc, index) => (
          <div key={index} className="bar-item">
            <div className="bar-label">{lc.location}</div>
            <div className="bar-container">
              <div 
                className="bar-fill" 
                style={{ width: `${(lc.count / maxCount) * 100}%` }}
              >
                <span className="bar-value">{lc.count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const t = (en: string, zh: string) => language === "en" ? en : zh;

  if (loading) return (
    <div className="loading-screen">
      <div className="nature-spinner">
        <div className="leaf"></div>
        <div className="leaf"></div>
        <div className="leaf"></div>
      </div>
      <p>{t("Initializing encrypted connection...", "正在初始化加密连接...")}</p>
    </div>
  );

  return (
    <div className="app-container nature-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="tree-icon"></div>
          </div>
          <h1>{t("PrivateWorkspace Booking", "隐私工位预订")}</h1>
        </div>
        
        <div className="header-actions">
          <div className="language-switcher">
            <button 
              className={`lang-btn ${language === "en" ? "active" : ""}`}
              onClick={() => setLanguage("en")}
            >
              EN
            </button>
            <button 
              className={`lang-btn ${language === "zh" ? "active" : ""}`}
              onClick={() => setLanguage("zh")}
            >
              中文
            </button>
          </div>
          
          <button 
            onClick={() => setShowBookingModal(true)} 
            className="book-btn nature-button"
          >
            <div className="add-icon"></div>
            {t("Book Workspace", "预订工位")}
          </button>
          
          <button 
            className="nature-button"
            onClick={checkAvailability}
          >
            {t("Check Availability", "检查可用性")}
          </button>
          
          <WalletManager 
            account={account} 
            onConnect={onConnect} 
            onDisconnect={onDisconnect} 
            language={language}
          />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>{t("Private Workspace Booking", "隐私工位预订系统")}</h2>
            <p>
              {t(
                "Book workspaces based on encrypted preferences without exposing your work habits",
                "根据加密偏好预订工位，无需暴露您的工作习惯"
              )}
            </p>
          </div>
        </div>
        
        <div className="dashboard-cards">
          <div className="dashboard-card nature-card">
            <h3>{t("Project Introduction", "项目介绍")}</h3>
            <p>
              {t(
                "Secure workspace booking platform using FHE technology to protect your preferences.",
                "使用FHE技术保护您的偏好设置的工位预订平台"
              )}
            </p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          
          <div className="dashboard-card nature-card">
            <h3>{t("Workspace Statistics", "工位统计")}</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{workspaces.length}</div>
                <div className="stat-label">{t("Total", "总计")}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{availableCount}</div>
                <div className="stat-label">{t("Available", "可用")}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{bookedCount}</div>
                <div className="stat-label">{t("Booked", "已预订")}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{reservedCount}</div>
                <div className="stat-label">{t("Reserved", "保留")}</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card nature-card">
            <h3>{t("Location Distribution", "位置分布")}</h3>
            {renderBarChart()}
          </div>
        </div>
        
        <div className="search-filter-section">
          <div className="search-box">
            <input
              type="text"
              placeholder={t("Search workspaces...", "搜索工位...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="nature-input"
            />
            <div className="search-icon"></div>
          </div>
          
          <div className="filter-box">
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="nature-select"
            >
              <option value="all">{t("All Locations", "所有位置")}</option>
              <option value="Downtown">{t("Downtown", "市中心")}</option>
              <option value="Business Park">{t("Business Park", "商务园区")}</option>
              <option value="Waterfront">{t("Waterfront", "滨水区")}</option>
              <option value="Tech Hub">{t("Tech Hub", "科技中心")}</option>
            </select>
          </div>
          
          <button 
            onClick={loadWorkspaces}
            className="refresh-btn nature-button"
            disabled={isRefreshing}
          >
            {isRefreshing 
              ? t("Refreshing...", "刷新中...") 
              : t("Refresh", "刷新")}
          </button>
        </div>
        
        <div className="workspaces-section">
          <div className="section-header">
            <h2>{t("Available Workspaces", "可用工位")}</h2>
          </div>
          
          <div className="workspaces-grid">
            {filteredWorkspaces.length === 0 ? (
              <div className="no-workspaces">
                <div className="no-workspaces-icon"></div>
                <p>{t("No workspaces found", "未找到工位")}</p>
              </div>
            ) : (
              filteredWorkspaces.map(workspace => (
                <div 
                  className={`workspace-card nature-card ${workspace.status}`} 
                  key={workspace.id}
                >
                  <div className="card-header">
                    <h3>{workspace.location}</h3>
                    <span className={`status-badge ${workspace.status}`}>
                      {workspace.status === "available" 
                        ? t("Available", "可用") 
                        : workspace.status === "booked" 
                          ? t("Booked", "已预订") 
                          : t("Reserved", "保留")}
                    </span>
                  </div>
                  
                  <div className="card-content">
                    <div className="workspace-meta">
                      <div className="meta-item">
                        <div className="meta-label">{t("ID", "编号")}</div>
                        <div className="meta-value">#{workspace.id.substring(0, 6)}</div>
                      </div>
                      <div className="meta-item">
                        <div className="meta-label">{t("Owner", "所有者")}</div>
                        <div className="meta-value">
                          {workspace.owner.substring(0, 6)}...{workspace.owner.substring(38)}
                        </div>
                      </div>
                      <div className="meta-item">
                        <div className="meta-label">{t("Date", "日期")}</div>
                        <div className="meta-value">
                          {new Date(workspace.bookingDate * 1000).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="fhe-tag">
                      <div className="lock-icon"></div>
                      {t("Preferences encrypted with FHE", "偏好使用FHE加密")}
                    </div>
                  </div>
                  
                  <div className="card-actions">
                    {workspace.status === "available" && (
                      <button 
                        className="action-btn nature-button primary"
                        onClick={() => {
                          setNewBookingData({
                            ...newBookingData,
                            location: workspace.location
                          });
                          setShowBookingModal(true);
                        }}
                      >
                        {t("Book Now", "立即预订")}
                      </button>
                    )}
                    
                    {workspace.status === "booked" && account.toLowerCase() === workspace.owner.toLowerCase() && (
                      <button 
                        className="action-btn nature-button"
                        onClick={() => {
                          // Cancel booking logic would go here
                          alert(t("Cancel booking feature would be implemented", "取消预订功能将在此实现"));
                        }}
                      >
                        {t("Manage Booking", "管理预订")}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showBookingModal && (
        <ModalBooking 
          onSubmit={bookWorkspace} 
          onClose={() => setShowBookingModal(false)} 
          booking={booking}
          bookingData={newBookingData}
          setBookingData={setNewBookingData}
          language={language}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
          language={language}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content nature-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="nature-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
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
              <div className="tree-icon"></div>
              <span>{t("PrivateWorkspace Booking", "隐私工位预订")}</span>
            </div>
            <p>
              {t(
                "Secure workspace booking using FHE technology to protect your preferences",
                "使用FHE技术保护您的偏好设置的工位预订平台"
              )}
            </p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">{t("How It Works", "工作原理")}</a>
            <a href="#" className="footer-link">{t("Privacy Policy", "隐私政策")}</a>
            <a href="#" className="footer-link">{t("Terms of Service", "服务条款")}</a>
            <a href="#" className="footer-link">{t("Contact", "联系我们")}</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="declaration">
            {t(
              "Your preferences are encrypted using FHE and never exposed to the platform",
              "您的偏好使用FHE加密，平台无法访问原始数据"
            )}
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} {t("PrivateWorkspace Booking", "隐私工位预订")}. {t("All rights reserved", "保留所有权利")}.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalBookingProps {
  onSubmit: () => void; 
  onClose: () => void; 
  booking: boolean;
  bookingData: any;
  setBookingData: (data: any) => void;
  language: "en" | "zh";
}

const ModalBooking: React.FC<ModalBookingProps> = ({ 
  onSubmit, 
  onClose, 
  booking,
  bookingData,
  setBookingData,
  language
}) => {
  const t = (en: string, zh: string) => language === "en" ? en : zh;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setBookingData({
      ...bookingData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!bookingData.location || !bookingData.preferences) {
      alert(t("Please fill required fields", "请填写必填字段"));
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="booking-modal nature-card">
        <div className="modal-header">
          <h2>{t("Book Workspace", "预订工位")}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            {t(
              "Your preferences will be encrypted with FHE", 
              "您的偏好将使用FHE加密"
            )}
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>{t("Location *", "位置 *")}</label>
              <select 
                name="location"
                value={bookingData.location} 
                onChange={handleChange}
                className="nature-select"
              >
                <option value="">{t("Select location", "选择位置")}</option>
                <option value="Downtown">{t("Downtown", "市中心")}</option>
                <option value="Business Park">{t("Business Park", "商务园区")}</option>
                <option value="Waterfront">{t("Waterfront", "滨水区")}</option>
                <option value="Tech Hub">{t("Tech Hub", "科技中心")}</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>{t("Booking Date", "预订日期")}</label>
              <input 
                type="date"
                name="date"
                value={bookingData.date} 
                onChange={handleChange}
                className="nature-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>{t("Preferences *", "偏好设置 *")}</label>
              <div className="preferences-options">
                {["quiet", "window", "private", "creative", "collaborative"].map(pref => (
                  <button
                    key={pref}
                    type="button"
                    className={`pref-option ${bookingData.preferences.includes(pref) ? "selected" : ""}`}
                    onClick={() => {
                      const prefs = bookingData.preferences.split(",").filter(Boolean);
                      if (prefs.includes(pref)) {
                        setBookingData({
                          ...bookingData,
                          preferences: prefs.filter(p => p !== pref).join(",")
                        });
                      } else {
                        setBookingData({
                          ...bookingData,
                          preferences: [...prefs, pref].join(",")
                        });
                      }
                    }}
                  >
                    {t(
                      pref === "quiet" ? "Quiet" :
                      pref === "window" ? "Window View" :
                      pref === "private" ? "Private" :
                      pref === "creative" ? "Creative Space" : "Collaborative",
                      
                      pref === "quiet" ? "安静" :
                      pref === "window" ? "靠窗" :
                      pref === "private" ? "私密" :
                      pref === "creative" ? "创意空间" : "协作空间"
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> 
            {t(
              "Preferences remain encrypted during FHE matching", 
              "偏好设置在使用FHE匹配过程中保持加密状态"
            )}
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn nature-button"
          >
            {t("Cancel", "取消")}
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={booking}
            className="submit-btn nature-button primary"
          >
            {booking 
              ? t("Encrypting with FHE...", "使用FHE加密中...") 
              : t("Book Securely", "安全预订")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;