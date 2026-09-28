import React, { useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Users,
  Shield,
  X,
  ChevronRight,
  User,
} from "lucide-react";
import "../styles/StudentSidebar.mobile.css";

const Item = ({ to, icon: Icon, children, onClick, end = false, iconColor = "#00C4B4", isCollapsed = false, label = "" }) => {
  const itemLabel = label || (typeof children === "string" ? children : "");
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      title={isCollapsed ? itemLabel : undefined}
      className={({ isActive }) =>
        `nav-item group flex items-center rounded-2xl text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isCollapsed
            ? "justify-center px-0 py-3 w-11 h-11 mx-auto"
            : "gap-3.5 px-4 py-3 w-full"
        } ${
          isActive
            ? "bg-[#252834] text-[#00C4B4] font-medium shadow-sm active"
            : "text-[#8E95A5] hover:text-[#F1F5F9] hover:bg-white/[0.03]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Icon */}
          <div className="nav-item-icon transition-transform duration-200 group-hover:scale-105 flex items-center justify-center flex-shrink-0">
            <Icon
              className="w-5 h-5 transition-colors duration-200"
              style={{ color: isActive ? "#00C4B4" : iconColor }}
            />
          </div>

          {/* Label with smooth width, opacity & transform transition */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isCollapsed
                ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
                : "max-w-[200px] opacity-100 translate-x-0 flex-1 ml-0.5"
            }`}
          >
            <span
              className="nav-item-text tracking-tight block truncate font-medium whitespace-nowrap"
              style={{ color: isActive ? "#00C4B4" : undefined }}
            >
              {children}
            </span>
          </div>
        </>
      )}
    </NavLink>
  );
};

export default function AdminSidebar({
  isOpen = false,
  onToggle,
  isCollapsed = false,
  onToggleCollapse,
}) {
  const navigate = useNavigate();

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isOpen && window.innerWidth <= 767) {
      document.body.classList.add("sidebar-open-mobile");
    } else {
      document.body.classList.remove("sidebar-open-mobile");
    }
    return () => {
      document.body.classList.remove("sidebar-open-mobile");
    };
  }, [isOpen]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    navigate("/login");
  };

  const handleNavClick = () => {
    if (window.innerWidth <= 768 && onToggle) {
      onToggle();
    }
  };

  // Get user details for profile card
  const storedUser = localStorage.getItem("user");
  let userDisplayName = "Admin";
  let userEmailOrRole = "Administrator";
  if (storedUser) {
    try {
      const u = JSON.parse(storedUser);
      userDisplayName = u.name || "Admin";
      userEmailOrRole = u.email || "Administrator";
    } catch (e) {}
  }

  const menuItems = [
    { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true, iconColor: "#00C4B4" },
    { to: "/admin/tests", icon: ClipboardList, label: "Tests", iconColor: "#2DD4BF" },
    { to: "/admin/users", icon: Users, label: "Users", iconColor: "#A78BFA" },
    { to: "/admin/proctoring", icon: Shield, label: "Proctoring", iconColor: "#F59E0B" },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="student-sidebar-overlay fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={onToggle}
        />
      )}

      {/* Sidebar - Wide width (18.5rem / 296px) when open, Sleek Rail (5rem / 80px) when closed */}
      <aside
        className={`
          student-sidebar-mobile fixed lg:sticky top-0 left-0 z-50 h-screen 
          text-slate-100 flex flex-col flex-shrink-0 overflow-hidden
          ${isOpen ? "open translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${isCollapsed ? "w-[5rem] px-2.5 py-6" : "w-[18.5rem] p-6"}
        `}
        style={{
          backgroundColor: "#181A22",
          borderRight: "1px solid rgba(255, 255, 255, 0.05)",
          width: isCollapsed ? "5rem" : "18.5rem",
          minWidth: isCollapsed ? "5rem" : "18.5rem",
          transition:
            "width 0.35s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.35s cubic-bezier(0.16, 1, 0.3, 1), padding 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: "width, min-width, padding",
        }}
      >
        {/* Header - Synchronized baseline with fluid cross-fade and centering */}
        <div
          className="sidebar-header flex items-center justify-between pb-5 mb-6 flex-shrink-0 relative overflow-hidden"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
        >
          {/* Logo & Portal Branding */}
          <div
            className={`sidebar-header-content flex items-center gap-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isCollapsed
                ? "max-w-0 opacity-0 -translate-x-4 pointer-events-none"
                : "max-w-[200px] opacity-100 translate-x-0"
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-[#20242D] border border-white/5 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div className="whitespace-nowrap">
              <h1 className="text-base font-semibold text-white tracking-tight leading-tight">
                CodingGita
              </h1>
              <p className="text-xs text-[#7E8594]">Admin Portal</p>
            </div>
          </div>

          {/* Controls: Codex Toggle Button & Mobile Close Button */}
          <div
            className={`flex items-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isCollapsed ? "w-full justify-center" : "justify-end gap-1"
            }`}
          >
            {/* Desktop MacBook Codex App Sidebar Toggle Button */}
            <button
              onClick={onToggleCollapse}
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg bg-[#20242D] hover:bg-[#282C38] border border-white/[0.08] text-slate-400 hover:text-[#00C4B4] transition-all duration-200 shadow-sm active:scale-95 flex-shrink-0 cursor-pointer"
              title={isCollapsed ? "Open Sidebar (⌘B)" : "Close Sidebar (⌘B)"}
              aria-label="Toggle sidebar"
            >
              <svg
                className="w-4 h-4 transition-transform duration-200"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="3" />
                <path d="M9 3v18" />
                <rect
                  width="6"
                  height="18"
                  x="3"
                  y="3"
                  rx="0"
                  fill="currentColor"
                  className="transition-opacity duration-300"
                  fillOpacity={isCollapsed ? 0 : 0.25}
                  stroke="none"
                />
              </svg>
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={onToggle}
              className="sidebar-close-btn lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation - Generous spacing matching design system */}
        <nav
          className={`nav-container space-y-2 flex-1 overflow-y-auto ${
            isCollapsed ? "px-0" : "pr-0.5"
          } custom-scrollbar transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}
        >
          {menuItems.map((item) => (
            <Item
              key={item.to}
              to={item.to}
              icon={item.icon}
              iconColor={item.iconColor}
              onClick={handleNavClick}
              end={item.end}
              isCollapsed={isCollapsed}
              label={item.label}
            >
              {item.label}
            </Item>
          ))}
        </nav>

        {/* Footer Section - Polished Profile Card & Logout with seamless morphing */}
        <div
          className="sidebar-footer mt-auto pt-4 space-y-2.5 flex-shrink-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}
        >
          {/* Profile Card */}
          <div
            title={userDisplayName}
            className={`group flex items-center rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border bg-[#20242D]/60 border-white/[0.04] text-slate-300 ${
              isCollapsed
                ? "w-11 h-11 p-0 justify-center mx-auto"
                : "w-full gap-3 p-2.5"
            }`}
          >
            {/* User Initials Avatar */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#133B42] to-[#1E293B] border border-[#00C4B4]/30 flex items-center justify-center text-[#00C4B4] font-bold text-xs flex-shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-105">
              {userDisplayName.charAt(0).toUpperCase()}
            </div>

            {/* Name and Subtitle with smooth collapse transition */}
            <div
              className={`min-w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isCollapsed
                  ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
                  : "max-w-[150px] opacity-100 translate-x-0 flex-1"
              }`}
            >
              <div className="text-xs font-semibold text-white truncate whitespace-nowrap">
                {userDisplayName}
              </div>
              <div className="text-[11px] text-[#7E8594] truncate whitespace-nowrap">
                Admin Account
              </div>
            </div>
          </div>

          {/* Sign Out Button (Morphs between full button and compact icon square) */}
          <button
            onClick={handleLogout}
            title="Sign Out"
            aria-label="Sign Out"
            className={`logout-button flex items-center justify-center rounded-xl text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/30 active:scale-95 cursor-pointer ${
              isCollapsed
                ? "w-11 h-11 p-0 mx-auto"
                : "w-full gap-2 px-3.5 py-2.5"
            }`}
          >
            <LogOut className="w-3.5 h-3.5 text-red-400 flex-shrink-0 transition-transform duration-200" />
            <div
              className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isCollapsed ? "max-w-0 opacity-0 pointer-events-none" : "max-w-[100px] opacity-100"
              }`}
            >
              <span className="whitespace-nowrap">Sign Out</span>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
}

