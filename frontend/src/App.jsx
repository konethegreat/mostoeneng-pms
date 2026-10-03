import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import ManagerDashboard from "./pages/ManagerDashboard.jsx";
import AttorneyDashboard from "./pages/AttorneyDashboard.jsx";
import ClientPortal from "./pages/ClientPortal.jsx";
import ReviewDetail from "./pages/ReviewDetail.jsx";
import FeedbackForm from "./pages/FeedbackForm.jsx";
import MyFeedback from "./pages/MyFeedback.jsx";
import Admin from "./pages/Admin.jsx";

// Sends each role to its home dashboard
function Home() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.role === "ADMIN" || user.role === "MANAGER") return <Navigate to="/manager" />;
  if (user.role === "ATTORNEY") return <Navigate to="/me" />;
  return <Navigate to="/client" />;
}

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <div className="container"><p>You don't have access to this page.</p></div>;
  return children;
}

export default function App() {
  const { loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/manager" element={<Protected roles={["MANAGER", "ADMIN"]}><ManagerDashboard /></Protected>} />
        <Route path="/me" element={<Protected roles={["ATTORNEY", "MANAGER"]}><AttorneyDashboard /></Protected>} />
        <Route path="/client" element={<Protected roles={["CLIENT"]}><ClientPortal /></Protected>} />
        <Route path="/feedback" element={<Protected><MyFeedback /></Protected>} />
        <Route path="/feedback/:requestId" element={<Protected><FeedbackForm /></Protected>} />
        <Route path="/reviews/:id" element={<Protected><ReviewDetail /></Protected>} />
        <Route path="/admin" element={<Protected roles={["ADMIN"]}><Admin /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
