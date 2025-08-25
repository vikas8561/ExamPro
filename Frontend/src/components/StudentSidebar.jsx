import { NavLink, useNavigate } from "react-router-dom";
import { Home, FileText, CheckSquare, LogOut } from "lucide-react";

const Item = ({ to, icon, children }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-700/60 w-full ${
        isActive ? "bg-slate-700" : ""
      }`
    }
  >
    <span className="w-5 h-5">{icon}</span>
    <span>{children}</span>
  </NavLink>
);

const StudentSidebar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <aside className="w-64 bg-slate-800 text-slate-100 p-5 flex flex-col">
      <h1 className="text-xl font-bold mb-8">Student Portal</h1>

      <nav className="space-y-2">
        <Item to="/student" icon={"🏠"}>Dashboard</Item>
        <Item to="/student/assignments" icon={"📄"}>Assigned Tests</Item>
        <Item to="/student/results" icon={"✔️"}>Completed Tests</Item>
      </nav>

      <button
        onClick={handleLogout}
        className="mt-auto flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-700/60 w-full text-red-400"
      >
        <LogOut size={18} /> Logout
      </button>
    </aside>
  );
};

export default StudentSidebar;
