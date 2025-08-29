import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

const Item = ({ to, icon, children }) => (
  <NavLink
    to={to}
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

export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <aside className="w-64 h-screen bg-slate-800 text-slate-100 p-5 flex flex-col">
      <h1 className="text-xl font-bold mb-8">Proctoring App</h1>

      <nav className="space-y-2">
        <Item to="/admin" icon={"🏠"}>Dashboard</Item>
        <Item to="/admin/tests" icon={"📄"}>Tests</Item>
        <Item to="/admin/users" icon={"👥"}>Users</Item>
        <Item to="/admin/assignments" icon={"📌"}>Assignments</Item>
        <Item to="/admin/reviews" icon={"✔️"}>Reviews</Item>
      </nav>

      <div className="mt-auto space-y-2">
        <NavLink
          to="/admin/tests/create"
          className="inline-block text-center text-black bg-white hover:bg-white-700 transition px-4 py-2 rounded-md w-full cursor-pointer"
        >
          New Test
        </NavLink>
        <button
          onClick={handleLogout}
          className="w-full text-center bg-red-600 hover:bg-red-700 transition px-4 py-2 rounded-md cursor-pointer"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
