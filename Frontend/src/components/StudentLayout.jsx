import { Outlet } from "react-router-dom";
import StudentSidebar from "./StudentSidebar";

const StudentLayout = () => {
  return (
    <div className="flex min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 h-screen">
        <StudentSidebar />
      </div>
      <main className="flex-1 bg-slate-900 text-white">
        <Outlet />
      </main>
    </div>
  );
};

export default StudentLayout;
