import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { 
  LogOut, 
  LayoutDashboard, 
  ClipboardList, 
  Code, 
  BookOpen, 
  Trophy, 
  User, 
  X,
  ChevronRight,
  GraduationCap
} from "lucide-react";

const Item = ({ to, icon: Icon, children, onClick, end = false }) => {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 nav-item ${
          isActive
            ? "text-white shadow-sm active-nav-item"
            : "text-gray-300 hover:text-white"
        }`
      }
      style={({ isActive }) => ({
        backgroundColor: isActive ? 'rgba(34, 211, 238, 0.15)' : 'transparent'
      })}
    >
      {({ isActive }) => (
        <>
          {/* Active indicator */}
          {isActive && (
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
              style={{ backgroundColor: '#22D3EE' }}
            ></div>
          )}
          
          {/* Icon with animation */}
          <div className={`
            relative z-10 transition-all duration-300
            ${isActive ? "scale-110" : "group-hover:scale-110"}
          `}>
            <Icon 
              className="w-5 h-5" 
              style={{ color: isActive ? '#22D3EE' : undefined }}
            />
          </div>
          
          {/* Text with animation */}
          <span 
            className={`
              relative z-10 font-medium transition-all duration-300
              ${isActive ? "translate-x-0" : "group-hover:translate-x-1"}
            `}
            style={{ color: isActive ? '#E5E7EB' : undefined }}
          >
            {children}
          </span>
          
          {/* Arrow indicator */}
          <ChevronRight 
            className={`
              ml-auto w-4 h-4 transition-all duration-300
              ${isActive ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0"}
            `}
            style={{ color: isActive ? '#22D3EE' : undefined }}
          />
        </>
      )}
    </NavLink>
  );
};

export default function StudentSidebar({ isOpen, onToggle }) {
  const navigate = useNavigate();
  const [profileHovered, setProfileHovered] = useState(false);

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
    { to: "/student/results", icon: Trophy, label: "Completed Tests" },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:sticky inset-y-0 left-0 z-50 w-72 h-screen 
          text-slate-100 p-6 flex flex-col
          transform transition-transform duration-300 ease-in-out
          shadow-2xl
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ 
          backgroundColor: '#0B1220',
          borderRight: '1px solid rgba(34, 211, 238, 0.2)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8 pb-6" style={{ borderBottom: '1px solid rgba(34, 211, 238, 0.2)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800/70 rounded-xl">
              <GraduationCap className="w-6 h-6" style={{ color: '#22D3EE' }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: '#E5E7EB' }}>
                Student Portal
              </h1>
              <p className="text-xs text-gray-400">Exam Management</p>
            </div>
          </div>
          
          {/* Mobile Close Button */}
          <button 
            onClick={onToggle}
            className="lg:hidden p-2 rounded-lg transition-colors"
            style={{ 
              backgroundColor: 'transparent'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(34, 211, 238, 0.1)';
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
        <nav className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
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
        <div className="mt-auto pt-4 space-y-3" style={{ borderTop: '1px solid rgba(34, 211, 238, 0.2)' }}>
          {/* Profile Button */}
          <NavLink
            to="/student/profile"
            onClick={handleNavClick}
            onMouseEnter={() => setProfileHovered(true)}
            onMouseLeave={() => setProfileHovered(false)}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative ${
                isActive ? "text-white shadow-sm" : "text-gray-300 hover:text-white"
              }`
            }
            style={({ isActive }) => ({
              backgroundColor: isActive ? 'rgba(34, 211, 238, 0.15)' : 'rgba(34, 211, 238, 0.05)'
            })}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div 
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                    style={{ backgroundColor: '#22D3EE' }}
                  ></div>
                )}
                <div 
                  className="p-2 rounded-lg transition-colors"
                  style={{ 
                    backgroundColor: isActive ? 'rgba(34, 211, 238, 0.2)' : 'rgba(34, 211, 238, 0.1)'
                  }}
                >
                  <User className="w-4 h-4" style={{ color: isActive ? '#22D3EE' : '#67E8F9' }} />
                </div>
                <span 
                  className="font-medium flex-1"
                  style={{ color: isActive ? '#E5E7EB' : undefined }}
                >
                  Profile
                </span>
                <ChevronRight 
                  className={`w-4 h-4 transition-all duration-300 ${
                    profileHovered ? "translate-x-1 opacity-100" : "opacity-0"
                  }`}
                  style={{ color: '#22D3EE' }}
                />
              </>
            )}
          </NavLink>
          
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 
                     font-medium
                     px-4 py-3 rounded-xl 
                     transition-all duration-300 
                     shadow-sm hover:shadow-md
                     transform hover:scale-[1.01] active:scale-[0.99]"
            style={{ 
              backgroundColor: 'rgba(34, 211, 238, 0.1)',
              color: '#67E8F9',
              border: '1px solid rgba(34, 211, 238, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(34, 211, 238, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(34, 211, 238, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.3)';
            }}
          >
            <LogOut className="w-5 h-5" />
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
          background: rgba(34, 211, 238, 0.1);
          border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(34, 211, 238, 0.3);
          border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(34, 211, 238, 0.5);
        }
        
        .nav-item:not(.active-nav-item):hover {
          background-color: rgba(34, 211, 238, 0.08) !important;
        }
      `}</style>
    </>
  );
}
