import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PublicLayout from './layouts/PublicLayout';
import AppShell from './layouts/AppShell';
import RequireAuth from './components/RequireAuth';
import { EmptyState } from './components/ui';
import Home from './pages/Home';
import { ForgotPassword, PasswordUpdated, Register, ResetPassword, SignIn, VerifyEmail } from './pages/auth';
import GraduateOverview from './pages/GraduateOverview';
import MyProjects from './pages/graduate/MyProjects';
import ProjectForm from './pages/graduate/ProjectForm';
import ProjectDetail from './pages/graduate/ProjectDetail';
import { PublicOpportunities, PublicProject, Ventures, VerifyProject } from './pages/public';
import Opportunities from './pages/graduate/Opportunities';
import Settings from './pages/Settings';
import Contact from './pages/Contact';
import GoTo from './components/GoTo';
import AdminTestimonials from './pages/admin/AdminTestimonials';
import Introductions from './pages/Introductions';
import Discover from './pages/investor/Discover';
import InvestorProject from './pages/investor/InvestorProject';
import Billing from './pages/investor/Billing';
import AdminIntroductions from './pages/admin/AdminIntroductions';
import AdminDashboard from './pages/admin/AdminDashboard';
import AccountQueue from './pages/admin/AccountQueue';
import ProjectQueue from './pages/admin/ProjectQueue';
import AdminProjectDetail from './pages/admin/AdminProjectDetail';
import AdminOpportunities from './pages/admin/AdminOpportunities';
import AdminRequests from './pages/admin/AdminRequests';
import AdminResults from './pages/admin/AdminResults';
import { Outbox, RulesConfig } from './pages/admin/PlatformAdmin';
import StaffOpportunities, { StaffOpportunityForm, StaffSelectionHome } from './pages/staff/StaffOpportunities';
import StaffSelection from './pages/staff/StaffSelection';
import StaffResults from './pages/staff/StaffResults';

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <EmptyState title="Page not found" action={<Link to="/" className="btn-primary">Go home</Link>}>
        The page you are looking for does not exist or has moved.
      </EmptyState>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="signin" element={<SignIn />} />
            <Route path="register" element={<Register />} />
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="password-updated" element={<PasswordUpdated />} />
            <Route path="ventures" element={<Ventures />} />
            <Route path="ventures/:id" element={<PublicProject />} />
            <Route path="verify" element={<VerifyProject />} />
            <Route path="opportunities" element={<PublicOpportunities />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route path="app" element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route element={<RequireAuth roles={['graduate']} />}>
              <Route index element={<GraduateOverview />} />
              <Route path="projects" element={<MyProjects />} />
              <Route path="projects/new" element={<ProjectForm />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="projects/:id/edit" element={<ProjectForm />} />
              <Route path="opportunities" element={<Opportunities />} />
            </Route>
            <Route element={<RequireAuth roles={['investor']} />}>
              <Route path="discover" element={<Discover />} />
              <Route path="discover/:code" element={<InvestorProject />} />
              <Route path="billing" element={<Billing />} />
            </Route>
            <Route element={<RequireAuth roles={['graduate', 'investor']} />}>
              <Route path="introductions" element={<Introductions />} />
              <Route path="contact" element={<Contact />} />
            </Route>
            <Route path="admin" element={<RequireAuth roles={['admin']} />}>
              <Route index element={<AdminDashboard />} />
              <Route path="graduates" element={<AccountQueue key="graduate" role="graduate" />} />
              <Route path="investors" element={<AccountQueue key="investor" role="investor" />} />
              <Route path="projects" element={<ProjectQueue />} />
              <Route path="projects/:id" element={<AdminProjectDetail />} />
              <Route path="introductions" element={<AdminIntroductions />} />
              <Route path="opportunities" element={<AdminOpportunities />} />
              <Route path="requests" element={<AdminRequests />} />
              <Route path="results" element={<AdminResults />} />
              <Route path="testimonials" element={<AdminTestimonials />} />
              <Route path="outbox" element={<Outbox />} />
              <Route path="config" element={<RulesConfig />} />
            </Route>
            <Route path="staff" element={<RequireAuth roles={['staff']} />}>
              <Route index element={<StaffOpportunities />} />
              <Route path="new" element={<StaffOpportunityForm />} />
              <Route path="selection" element={<StaffSelectionHome />} />
              <Route path="results" element={<StaffResults />} />
              <Route path=":id" element={<StaffSelection />} />
              <Route path=":id/edit" element={<StaffOpportunityForm />} />
            </Route>
            <Route path="go/:target" element={<GoTo />} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/:section" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
