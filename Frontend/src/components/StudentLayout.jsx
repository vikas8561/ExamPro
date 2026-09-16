import { Outlet } from "react-router-dom";
import StudentSidebar from "./StudentSidebar";

const StudentLayout = () => {
  return (
    <div className="flex min-h-screen bg-[#16181F] text-slate-100">
      <div className="sticky top-0 h-screen">
        <StudentSidebar />
      </div>
      <main className="flex-1 bg-[#16181F] text-slate-100">
        <Outlet />
      </main>
    </div>
  );
};

export default StudentLayout;
