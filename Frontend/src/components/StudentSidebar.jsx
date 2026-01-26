import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Code,
  Code2,
  BookOpen,
  Trophy,
  User,
  X,
  ChevronRight,
  GraduationCap,
} from "lucide-react";
import "../styles/StudentSidebar.mobile.css";

const Item = ({ to, icon: Icon, children, onClick, end = false }) => {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `nav-item group relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all duration-300 ${isActive
          ? "text-white shadow-sm active"
          : "text-gray-300 hover:text-white"
        }`
      }
      style={({ isActive }) => ({
        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.15)' : 'transparent'
      })}
    >
      {({ isActive }) => (
        <>
          {/* Active indicator */}
          {isActive && (
            <div
              className="active-indicator absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
              style={{ backgroundColor: '#FFFFFF' }}
            ></div>
          )}

          {/* Icon with animation */}
          <div className={`
            nav-item-icon relative z-10 transition-all duration-300
            ${isActive ? "scale-110" : "group-hover:scale-110"}
          `}>
            <Icon
              className="w-4.5 h-4.5"
              style={{ color: isActive ? '#FFFFFF' : undefined }}
            />
          </div>

          {/* Text with animation */}
          <span
            className={`
              nav-item-text relative z-10 text-sm font-medium transition-all duration-300
              ${isActive ? "translate-x-0" : "group-hover:translate-x-1"}
            `}
            style={{ color: isActive ? '#E5E7EB' : undefined }}
          >
            {children}
          </span>

          {/* Arrow indicator */}
          <ChevronRight
            className={`
              nav-item-arrow ml-auto w-3.5 h-3.5 transition-all duration-300
              ${isActive ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0"}
            `}
            style={{ color: isActive ? '#FFFFFF' : undefined }}
          />
        </>
      )}
    </NavLink>
  );
};

export default function StudentSidebar({ isOpen, onToggle }) {
  const navigate = useNavigate();
  const [profileHovered, setProfileHovered] = useState(false);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isOpen && window.innerWidth <= 767) {
      document.body.classList.add('sidebar-open-mobile');
    } else {
      document.body.classList.remove('sidebar-open-mobile');
    }
    return () => {
      document.body.classList.remove('sidebar-open-mobile');
    };
  }, [isOpen]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    navigate('/login');
  };

  const handleNavClick = () => {
    // Close sidebar on mobile when nav item is clicked
    if (window.innerWidth <= 768 && onToggle) {
      onToggle();
    }
  };

  const menuItems = [
    { to: "/student", icon: LayoutDashboard, label: "Dashboard", end: true },
    { to: "/student/assignments", icon: ClipboardList, label: "Assigned Tests" },
    { to: "/student/coding-tests", icon: Code, label: "Coding Tests" },
    { to: "/student/practice-tests", icon: BookOpen, label: "Practice Tests" },
    { to: "/student/dsa-practice", icon: Code2, label: "DSA Practice" },
    { to: "/student/results", icon: Trophy, label: "Completed Tests" },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="student-sidebar-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          student-sidebar-mobile fixed lg:sticky inset-y-0 left-0 z-50 w-68 h-screen 
          text-slate-100 p-5 flex flex-col
          transform transition-transform duration-300 ease-in-out
          shadow-2xl
          ${isOpen ? 'open translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{
          backgroundColor: '#0B1220',
          borderRight: '1px solid rgba(255, 255, 255, 0.2)',
          width: '17rem'
        }}
      >
        {/* Header */}
        <div className="sidebar-header flex items-center justify-between mb-7 pb-5" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
          <div className="sidebar-header-content flex items-center gap-2.5">
            <div className="sidebar-logo p-2 bg-slate-800/70 rounded-xl">
              <GraduationCap className="w-5 h-5" style={{ color: '#FFFFFF' }} />
            </div>
            <div>
              <h1 className="sidebar-title text-lg font-bold" style={{ color: '#E5E7EB' }}>
                Student Portal
              </h1>
              <p className="sidebar-subtitle text-xs text-gray-400">Exam Management</p>
            </div>
          </div>

          {/* Mobile Close Button */}
          <button
            onClick={onToggle}
            className="sidebar-close-btn lg:hidden p-2 rounded-lg transition-colors"
            style={{
              backgroundColor: 'transparent'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" style={{ color: '#E5E7EB' }} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="nav-container space-y-2 flex-1">
          {menuItems.map((item) => (
            <Item
              key={item.to}
              to={item.to}
              icon={item.icon}
              onClick={handleNavClick}
              end={item.end}
            >
              {item.label}
            </Item>
          ))}
        </nav>

        {/* Footer Section */}
        <div className="sidebar-footer mt-auto pt-4 space-y-2.5" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
          {/* Profile Button */}
          <NavLink
            to="/student/profile"
            onClick={handleNavClick}
            onMouseEnter={() => setProfileHovered(true)}
            onMouseLeave={() => setProfileHovered(false)}
            className={({ isActive }) =>
              `profile-button group flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all duration-300 relative ${isActive ? "text-white shadow-sm" : "text-gray-300 hover:text-white"
              }`
            }
            style={({ isActive }) => ({
              backgroundColor: isActive ? '#4F46E5' : '#334155',
              border: isActive ? '1px solid #6366F1' : '1px solid #475569',
              color: '#FFFFFF'
            })}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div
                    className="active-indicator absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                    style={{ backgroundColor: '#FFFFFF' }}
                  ></div>
                )}
                <div
                  className="p-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <User className="profile-icon w-4 h-4" style={{ color: isActive ? '#FFFFFF' : '#FFFFFF' }} />
                </div>
                <span
                  className="profile-text text-sm font-medium flex-1"
                  style={{ color: isActive ? '#E5E7EB' : undefined }}
                >
                  Profile
                </span>
                <ChevronRight
                  className={`nav-item-arrow w-3.5 h-3.5 transition-all duration-300 ${profileHovered ? "translate-x-1 opacity-100" : "opacity-0"
                    }`}
                  style={{ color: '#FFFFFF' }}
                />
              </>
            )}
          </NavLink>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="logout-button w-full flex items-center justify-center gap-2.5 
                     text-sm font-medium
                     px-3.5 py-2.5 rounded-xl 
                     transition-all duration-300 
                     shadow-sm hover:shadow-md
                     transform hover:scale-[1.01] active:scale-[0.99]"
            style={{
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              border: '1px solid #EF4444'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#B91C1C';
              e.currentTarget.style.borderColor = '#DC2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#DC2626';
              e.currentTarget.style.borderColor = '#EF4444';
            }}
          >
            <LogOut className="logout-icon w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
        
        .nav-item:not(.active-nav-item):hover {
          background-color: rgba(255, 255, 255, 0.08) !important;
        }
      `}</style>
    </>
  );
}
