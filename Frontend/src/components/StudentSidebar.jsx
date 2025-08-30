import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

const Item = ({ to, icon, children, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-700/60 ${
        isActive ? "bg-slate-700" : ""
      }`
    }
  >
    <span className="w-5 h-5">{icon}</span>
    <span>{children}</span>
  </NavLink>
);

export default function StudentSidebar({ isOpen, onToggle }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleNavClick = () => {
    // Close sidebar on mobile when nav item is clicked
    if (window.innerWidth <= 768 && onToggle) {
      onToggle();
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 h-screen bg-slate-800 text-slate-100 p-5 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold">Student Portal</h1>
          {/* Mobile Close Button */}
          <button 
            onClick={onToggle}
            className="lg:hidden p-2 hover:bg-slate-700 rounded-md"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="space-y-2">
          <Item to="/student" icon={"🏠"} onClick={handleNavClick}>Dashboard</Item>
          <Item to="/student/assignments" icon={"📄"} onClick={handleNavClick}>Assigned Tests</Item>
          <Item to="/student/results" icon={"✔️"} onClick={handleNavClick}>Completed Tests</Item>
        </nav>

        <div className="mt-auto space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 transition px-4 py-2 rounded-md cursor-pointer"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>
    </>
  );
}
