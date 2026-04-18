import React, { useState } from 'react';
import {
  Database,
  Users,
  Stethoscope,
  DollarSign,
  MessageSquare,
  Settings,
  Shield,
  BarChart3,
  Calendar,
  FileText,
  Pill,
  Link2,
  ChevronRight,
  ArrowRight,
  Lock,
  Home,
  User,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  Mail,
  Phone,
  Code,
  GitBranch,
} from 'lucide-react';

export default function ProjectArchitecture() {
  const [activeTab, setActiveTab] = useState('tables');

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all border-b-2 ${
        activeTab === id
          ? 'border-teal-500 text-teal-600 bg-teal-50'
          : 'border-slate-300 text-slate-600 hover:text-teal-600'
      }`}
    >
      <Icon size={20} />
      {label}
    </button>
  );

  // ==================== TAB: DATABASE TABLES ====================
  const TablesSection = () => (
    <div className="space-y-8 pb-8">
      {/* Core Tables */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-100 p-3 rounded-lg">
            <Shield size={24} className="text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Core Tables</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DatabaseTable
            name="profiles"
            description="Doctors & Admins"
            fields={['id', 'user_id', 'role', 'specialty', 'clinic_id']}
            color="blue"
          />
          <DatabaseTable
            name="patients"
            description="Patient records"
            fields={['id', 'doctor_id', 'name', 'email', 'phone']}
            color="blue"
          />
          <DatabaseTable
            name="clinics"
            description="Health centers"
            fields={['id', 'name', 'address', 'city', 'owner_id']}
            color="blue"
          />
        </div>
      </div>

      {/* Clinical Flow */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-emerald-100 p-3 rounded-lg">
            <Stethoscope size={24} className="text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Clinical Flow (Core Chain)</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 overflow-x-auto pb-4">
            <FlowStep step="1" name="appointments" color="emerald" />
            <ChevronRight className="text-slate-400 flex-shrink-0" />
            <FlowStep step="2" name="consultations" color="emerald" />
            <ChevronRight className="text-slate-400 flex-shrink-0" />
            <FlowStep step="3" name="consultation_payments" color="emerald" />
            <ChevronRight className="text-slate-400 flex-shrink-0" />
            <FlowStep step="4" name="billing_documents" color="emerald" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <DatabaseTable
              name="appointments"
              description="Booking & CIT codes"
              fields={['id', 'appointment_code', 'patient_id', 'doctor_id', 'scheduled_at']}
              color="emerald"
            />
            <DatabaseTable
              name="consultations"
              description="Doctor confirmation"
              fields={['id', 'consultation_code', 'appointment_id', 'status', 'notes']}
              color="emerald"
            />
            <DatabaseTable
              name="consultation_payments"
              description="Patient to Doctor"
              fields={['id', 'consultation_id', 'amount', 'status', 'proof_url']}
              color="emerald"
            />
            <DatabaseTable
              name="billing_documents"
              description="Invoices & Receipts"
              fields={['id', 'type', 'consultation_id', 'amount', 'pdf_url']}
              color="emerald"
            />
          </div>
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-sm text-emerald-800">
              <strong>Flow:</strong> Patient books → Appointment (auto CIT-code) → Doctor approves → Consultation (auto CON-code) → Patient pays → Invoice/Receipt auto-generated
            </p>
          </div>
          <DatabaseTable
            name="prescriptions"
            description="Medications (JSONB array)"
            fields={['id', 'consultation_id', 'medications[]', 'instructions', 'created_at']}
            color="emerald"
          />
        </div>
      </div>

      {/* Subscription Flow */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-100 p-3 rounded-lg">
            <DollarSign size={24} className="text-amber-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Subscription Flow (Doctor ← Delta)</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 overflow-x-auto pb-4">
            <FlowStep step="1" name="subscriptions" color="amber" />
            <ChevronRight className="text-slate-400 flex-shrink-0" />
            <FlowStep step="2" name="subscription_payments" color="amber" />
            <ChevronRight className="text-slate-400 flex-shrink-0" />
            <FlowStep step="3" name="invoices" color="amber" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DatabaseTable
              name="subscriptions"
              description="Doctor's plan status"
              fields={['id', 'doctor_id', 'plan', 'status', 'expires_at']}
              color="amber"
            />
            <DatabaseTable
              name="subscription_payments"
              description="Payment receipts"
              fields={['id', 'subscription_id', 'proof_url', 'verified', 'verified_by']}
              color="amber"
            />
            <DatabaseTable
              name="invoices"
              description="Delta → Doctor invoices"
              fields={['id', 'subscription_id', 'amount', 'period', 'pdf_url']}
              color="amber"
            />
          </div>
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <strong>Plans:</strong> FREE (30 days trial) → PRO ($20/month) → ENTERPRISE (custom)
              <br />
              <strong>Status:</strong> trial → active → suspended → cancelled
            </p>
          </div>
          <DatabaseTable
            name="plan_features"
            description="Feature gating per plan"
            fields={['id', 'plan_id', 'feature_key', 'enabled', 'limit']}
            color="amber"
          />
        </div>
      </div>

      {/* CRM Tables */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-purple-100 p-3 rounded-lg">
            <MessageSquare size={24} className="text-purple-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">CRM & Communication</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DatabaseTable
            name="leads"
            description="Potential patients"
            fields={['id', 'doctor_id', 'name', 'email', 'status', 'source']}
            color="purple"
          />
          <DatabaseTable
            name="lead_messages"
            description="Lead interactions"
            fields={['id', 'lead_id', 'message', 'sender', 'created_at']}
            color="purple"
          />
          <DatabaseTable
            name="patient_messages"
            description="Doctor ↔ Patient chat"
            fields={['id', 'doctor_id', 'patient_id', 'message', 'created_at']}
            color="purple"
          />
        </div>
      </div>

      {/* Configuration Tables */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-slate-600 p-3 rounded-lg">
            <Settings size={24} className="text-white" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Configuration & Settings</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DatabaseTable
            name="pricing_plans"
            description="Plan templates"
            fields={['id', 'name', 'price', 'billing_period', 'features']}
            color="slate"
          />
          <DatabaseTable
            name="doctor_services"
            description="Services offered"
            fields={['id', 'doctor_id', 'service_name', 'price', 'duration']}
            color="slate"
          />
          <DatabaseTable
            name="doctor_insurances"
            description="Accepted insurances"
            fields={['id', 'doctor_id', 'insurance_id', 'coverage_pct']}
            color="slate"
          />
          <DatabaseTable
            name="payment_accounts"
            description="Payment methods"
            fields={['id', 'doctor_id', 'type', 'account_number', 'verified']}
            color="slate"
          />
          <DatabaseTable
            name="doctor_invitations"
            description="Invite links for doctors"
            fields={['id', 'token', 'email', 'expires_at', 'used']}
            color="slate"
          />
          <DatabaseTable
            name="clinic_invitations"
            description="Invite links for clinics"
            fields={['id', 'token', 'clinic_id', 'expires_at', 'used']}
            color="slate"
          />
          <DatabaseTable
            name="admin_roles"
            description="Role-based access"
            fields={['id', 'admin_id', 'role', 'permissions', 'granted_at']}
            color="slate"
          />
          <DatabaseTable
            name="appointment_reminders_config"
            description="Reminder settings"
            fields={['id', 'doctor_id', 'days_before', 'channels', 'enabled']}
            color="slate"
          />
          <DatabaseTable
            name="reminders_queue"
            description="Scheduled reminders"
            fields={['id', 'appointment_id', 'send_at', 'status', 'channel']}
            color="slate"
          />
          <DatabaseTable
            name="patient_packages"
            description="Treatment packages"
            fields={['id', 'doctor_id', 'name', 'sessions', 'price']}
            color="slate"
          />
          <DatabaseTable
            name="waitlist"
            description="Patient waitlist"
            fields={['id', 'doctor_id', 'patient_id', 'preferred_date', 'status']}
            color="slate"
          />
        </div>
      </div>

      {/* Additional Tables */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-100 p-3 rounded-lg">
            <FileText size={24} className="text-indigo-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Additional Tables</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DatabaseTable
            name="ehr_records"
            description="Electronic Health Records"
            fields={['id', 'patient_id', 'doctor_id', 'record_type', 'data_jsonb', 'created_at']}
            color="indigo"
          />
          <DatabaseTable
            name="audit_logs"
            description="System audit trail"
            fields={['id', 'user_id', 'action', 'resource', 'timestamp']}
            color="indigo"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-6">
        <h4 className="font-bold text-teal-900 mb-3">Total: 28 Tables</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div className="text-teal-700">
            <div className="font-semibold">3</div>
            <div className="text-xs">Core</div>
          </div>
          <div className="text-emerald-700">
            <div className="font-semibold">5</div>
            <div className="text-xs">Clinical</div>
          </div>
          <div className="text-amber-700">
            <div className="font-semibold">4</div>
            <div className="text-xs">Subscriptions</div>
          </div>
          <div className="text-purple-700">
            <div className="font-semibold">3</div>
            <div className="text-xs">CRM</div>
          </div>
          <div className="text-slate-700">
            <div className="font-semibold">13</div>
            <div className="text-xs">Config</div>
          </div>
        </div>
      </div>
    </div>
  );

  // ==================== TAB: CLINICAL FLOW ====================
  const ClinicalFlowSection = () => (
    <div className="space-y-8 pb-8">
      {/* Main Clinical Flow */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-8">Complete Clinical Flow</h3>

        <div className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="font-bold text-emerald-600">1</span>
              </div>
              <div className="w-1 h-16 bg-emerald-200 mt-2"></div>
            </div>
            <div className="pb-6 pt-1">
              <h4 className="font-bold text-lg text-slate-900">Patient Books Appointment</h4>
              <p className="text-sm text-slate-600 mt-1">Via /invite/[token] or /book/[doctorId]</p>
              <div className="mt-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-sm font-mono text-emerald-800">
                  Table: <strong>appointments</strong>
                  <br />
                  Auto-generates: <strong>appointment_code</strong> (CIT-XXXXX)
                </p>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="font-bold text-emerald-600">2</span>
              </div>
              <div className="w-1 h-16 bg-emerald-200 mt-2"></div>
            </div>
            <div className="pb-6 pt-1">
              <h4 className="font-bold text-lg text-slate-900">Doctor Confirms Appointment</h4>
              <p className="text-sm text-slate-600 mt-1">Doctor reviews & approves in calendar</p>
              <div className="mt-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-sm font-mono text-emerald-800">
                  Table: <strong>consultations</strong> (created)
                  <br />
                  Auto-generates: <strong>consultation_code</strong> (CON-XXXXX)
                </p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="font-bold text-emerald-600">3</span>
              </div>
              <div className="w-1 h-16 bg-emerald-200 mt-2"></div>
            </div>
            <div className="pb-6 pt-1">
              <h4 className="font-bold text-lg text-slate-900">Consultation Occurs</h4>
              <p className="text-sm text-slate-600 mt-1">Doctor creates prescriptions & EHR notes</p>
              <div className="mt-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-sm font-mono text-emerald-800">
                  Tables: <strong>prescriptions</strong>, <strong>ehr_records</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="font-bold text-emerald-600">4</span>
              </div>
              <div className="w-1 h-16 bg-emerald-200 mt-2"></div>
            </div>
            <div className="pb-6 pt-1">
              <h4 className="font-bold text-lg text-slate-900">Patient Pays for Consultation</h4>
              <p className="text-sm text-slate-600 mt-1">Payment registered in system</p>
              <div className="mt-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-sm font-mono text-emerald-800">
                  Table: <strong>consultation_payments</strong>
                  <br />
                  Status: pending → paid → verified
                </p>
              </div>
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="font-bold text-emerald-600">5</span>
              </div>
            </div>
            <div className="pt-1">
              <h4 className="font-bold text-lg text-slate-900">Auto-Generate Invoice/Receipt</h4>
              <p className="text-sm text-slate-600 mt-1">System creates PDF documents</p>
              <div className="mt-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-sm font-mono text-emerald-800">
                  Table: <strong>billing_documents</strong>
                  <br />
                  Types: factura (invoice), recibo (receipt), presupuesto (quote)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Decision Points */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Key Decision Points</h3>
        <div className="space-y-4">
          <DecisionBox
            title="Appointment Status Changes"
            items={[
              'pending → approved → consultation_created',
              'cancelled → refund_issued',
              'no_show → marked & stats tracked',
            ]}
          />
          <DecisionBox
            title="Payment Status Flow"
            items={[
              'pending → received (patient uploaded proof) → verified (doctor confirmed)',
              'rejected → patient must repay',
              'partially_paid → balance due',
            ]}
          />
          <DecisionBox
            title="Prescription Workflow"
            items={[
              'created → sent_to_patient → dispensed → collected',
              'Medications stored as JSONB array for flexibility',
              'Each medication includes: name, dosage, frequency, duration',
            ]}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Typical Timeline</h3>
        <div className="relative">
          <div className="absolute top-0 bottom-0 left-6 w-1 bg-gradient-to-b from-teal-500 via-emerald-500 to-emerald-600"></div>
          <div className="space-y-6 pl-20">
            <TimelineItem
              day="Day 0"
              time="10:00 AM"
              event="Patient books appointment (CIT-001)"
              color="teal"
            />
            <TimelineItem
              day="Day 0"
              time="10:05 AM"
              event="Doctor approves, consultation created (CON-001)"
              color="teal"
            />
            <TimelineItem
              day="Day 0"
              time="2:00 PM"
              event="Consultation happens, prescription created"
              color="emerald"
            />
            <TimelineItem
              day="Day 0-1"
              time="By EOD"
              event="Patient uploads payment proof"
              color="emerald"
            />
            <TimelineItem
              day="Day 1"
              time="Next AM"
              event="Doctor verifies payment"
              color="emerald"
            />
            <TimelineItem
              day="Day 1"
              time="Auto"
              event="Invoice/Receipt auto-generated & sent"
              color="emerald"
            />
          </div>
        </div>
      </div>
    </div>
  );

  // ==================== TAB: USER ROLES ====================
  const RolesSection = () => (
    <div className="space-y-8 pb-8">
      {/* Super Admin */}
      <RoleCard
        role="Super Admin"
        path="/admin"
        icon={Shield}
        color="indigo"
        description="Platform administrator - manages doctors, subscriptions, and system configuration"
        sections={[
          {
            title: 'Dashboard',
            items: [
              'Real-time KPIs (total doctors, active subscriptions, revenue)',
              'Doctor signup trends',
              'Subscription status overview',
              'Payment verification queue',
            ],
          },
          {
            title: 'Doctor Management',
            items: [
              'List all doctors with status (active/suspended/deleted)',
              'Create new doctor account',
              'Approve/suspend/delete doctors',
              'View doctor profiles & specialties',
              'Monitor doctor activity',
            ],
          },
          {
            title: 'Subscription Management',
            items: [
              'View all subscriptions (plan, status, expiry date)',
              'Verify payment receipts (doctor uploads proof)',
              'Approve payment → activate plan for 30 days',
              'Auto-suspend expired subscriptions',
              'Generate invoices for doctors',
              'Configure plan features',
            ],
          },
          {
            title: 'System Configuration',
            items: [
              'Manage pricing plans (price, features, duration)',
              'Configure payment accounts (payment methods)',
              'Set up reminders (7 days, 3 days, 1 day before expiry)',
              'Manage admin roles & permissions',
              'View audit logs',
            ],
          },
        ]}
      />

      {/* Doctor */}
      <RoleCard
        role="Doctor"
        path="/doctor"
        icon={Stethoscope}
        color="emerald"
        description="Medical professional - manages patients, appointments, consultations, and billing"
        sections={[
          {
            title: 'Dashboard',
            items: [
              'Quick stats: today\'s appointments, pending payments, active patients',
              'Upcoming appointments list',
              'Recent consultations',
              'Revenue summary (today/month/year)',
            ],
          },
          {
            title: 'Calendar & Appointments',
            items: [
              'View calendar (day/week/month view)',
              'See bookings from patients',
              'Approve/reject/reschedule appointments',
              'Auto-approve setting for trusted patients',
              'Appointment codes (CIT-XXXXX) auto-generated',
            ],
          },
          {
            title: 'Consultations & Clinical',
            items: [
              'List all consultations (linked to appointments)',
              'Consultation codes (CON-XXXXX) auto-generated',
              'Create/edit prescriptions (JSONB medications)',
              'Add EHR notes & clinical records',
              'Attach documents & lab results',
            ],
          },
          {
            title: 'Billing & Finance',
            items: [
              'Verify consultation payments from patients',
              'View payment history & receipts',
              'Generate invoices & receipts (auto-generated on verified payment)',
              'Track revenue by service/patient/date',
              'Export financial reports',
            ],
          },
          {
            title: 'CRM (Kanban Board)',
            items: [
              'Manage leads (potential patients)',
              'Kanban: New → Contacted → Interested → Converted',
              'Chat with leads',
              'Convert lead to patient',
            ],
          },
          {
            title: 'Patient Management',
            items: [
              'List all patients',
              'View patient history & EHR',
              'Send messages to patients',
              'View prescriptions issued',
              'Manage patient packages (treatment plans)',
            ],
          },
          {
            title: 'Settings & Configuration',
            items: [
              'Edit profile (name, specialty, bio, photo)',
              'Configure pricing (service fees)',
              'Add accepted insurances',
              'Configure payment accounts',
              'Set appointment reminders (channels, days before)',
              'Configure business hours & availability',
              'Integrations (SMS, email, WhatsApp)',
            ],
          },
        ]}
      />

      {/* Patient */}
      <RoleCard
        role="Patient"
        path="/patient"
        icon={User}
        color="teal"
        description="Patient portal - book appointments, manage consultations, and health records"
        sections={[
          {
            title: 'Dashboard',
            items: [
              'Upcoming appointments',
              'Recent consultations',
              'Prescription list',
              'Messages from doctor',
            ],
          },
          {
            title: 'Booking',
            items: [
              'Access via /invite/[token] or /book/[doctorId]',
              'Select doctor & available time',
              'Auto-generates appointment_code (CIT-XXXXX)',
              'Confirmation sent to patient & doctor',
            ],
          },
          {
            title: 'Appointments & Consultations',
            items: [
              'View all booked appointments',
              'Reschedule or cancel with notice',
              'View consultation details after visit',
              'View consultation_code (CON-XXXXX)',
              'Access prescriptions from consultation',
            ],
          },
          {
            title: 'Payments',
            items: [
              'See consultation cost',
              'Upload payment proof (screenshot/receipt)',
              'Track payment status (pending → paid → verified)',
              'View/download invoices & receipts',
            ],
          },
          {
            title: 'Health Records',
            items: [
              'View prescriptions (medications, dosage, instructions)',
              'Access EHR notes from consultations',
              'Download lab results & documents',
              'View medical history by date',
            ],
          },
          {
            title: 'Communication',
            items: [
              'Send messages to doctor (chat)',
              'Receive appointment reminders',
              'Get prescription updates',
              'View doctor contact info',
            ],
          },
        ]}
      />

      {/* Permission Summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Role Permission Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-bold text-slate-900">Resource</th>
                <th className="text-center py-3 px-4 font-bold text-indigo-600">Super Admin</th>
                <th className="text-center py-3 px-4 font-bold text-emerald-600">Doctor</th>
                <th className="text-center py-3 px-4 font-bold text-teal-600">Patient</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {[
                ['Doctors', '✓ CRUD', '✓ View own', '✗'],
                ['Subscriptions', '✓ Manage', '✓ View own', '✗'],
                ['Appointments', '✓ View all', '✓ Manage own', '✓ Manage own'],
                ['Consultations', '✓ View all', '✓ Manage own', '✓ View own'],
                ['Payments', '✓ Verify', '✓ Verify patient', '✓ Upload proof'],
                ['Invoices', '✓ Generate', '✓ Generate own', '✓ View own'],
                ['Patients', '✓ View all', '✓ Manage own', '✓ View own'],
                ['Messages', '✓ View all', '✓ Doctor↔Patient', '✓ Patient↔Doctor'],
                ['CRM', '✓ View all', '✓ Manage own leads', '✗'],
                ['Reports', '✓ All', '✓ Own only', '✓ Own only'],
              ].map((row, i) => (
                <tr key={i}>
                  <td className="py-3 px-4 font-semibold text-slate-900">{row[0]}</td>
                  <td className="py-3 px-4 text-center text-indigo-600 font-mono">{row[1]}</td>
                  <td className="py-3 px-4 text-center text-emerald-600 font-mono">{row[2]}</td>
                  <td className="py-3 px-4 text-center text-teal-600 font-mono">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ==================== TAB: API ROUTES ====================
  const APISection = () => (
    <div className="space-y-8 pb-8">
      <APIGroup
        group="Admin API"
        prefix="/api/admin"
        color="indigo"
        routes={[
          {
            method: 'POST',
            path: '/doctors',
            description: 'Create new doctor account',
          },
          {
            method: 'GET',
            path: '/doctors',
            description: 'List all doctors with filters',
          },
          {
            method: 'PUT',
            path: '/doctors/:id',
            description: 'Update doctor profile & settings',
          },
          {
            method: 'POST',
            path: '/doctors/:id/suspend',
            description: 'Suspend doctor account',
          },
          {
            method: 'POST',
            path: '/doctors/:id/activate',
            description: 'Activate suspended doctor',
          },
          {
            method: 'GET',
            path: '/subscriptions',
            description: 'List all subscriptions with status',
          },
          {
            method: 'POST',
            path: '/subscriptions/:id/verify-payment',
            description: 'Verify payment receipt from doctor',
          },
          {
            method: 'POST',
            path: '/subscriptions/:id/activate',
            description: 'Activate subscription (after payment verified)',
          },
          {
            method: 'POST',
            path: '/subscriptions/:id/suspend',
            description: 'Suspend expired subscription',
          },
          {
            method: 'GET',
            path: '/invoices',
            description: 'List invoices (Delta → doctors)',
          },
          {
            method: 'POST',
            path: '/invoices/generate',
            description: 'Generate invoice for doctor',
          },
          {
            method: 'GET',
            path: '/plan-features',
            description: 'List feature gates per plan',
          },
          {
            method: 'PUT',
            path: '/plan-features/:id',
            description: 'Update feature availability',
          },
          {
            method: 'GET',
            path: '/dashboard/kpis',
            description: 'Get KPI metrics (doctors, revenue, etc)',
          },
          {
            method: 'GET',
            path: '/audit-logs',
            description: 'View system audit trail',
          },
        ]}
      />

      <APIGroup
        group="Doctor API"
        prefix="/api/doctor"
        color="emerald"
        routes={[
          {
            method: 'GET',
            path: '/dashboard',
            description: 'Get doctor dashboard data (KPIs, upcoming)',
          },
          {
            method: 'GET',
            path: '/appointments',
            description: 'List doctor\'s appointments',
          },
          {
            method: 'POST',
            path: '/appointments/:id/approve',
            description: 'Approve appointment → create consultation',
          },
          {
            method: 'POST',
            path: '/appointments/:id/reject',
            description: 'Reject booking',
          },
          {
            method: 'GET',
            path: '/consultations',
            description: 'List doctor\'s consultations',
          },
          {
            method: 'POST',
            path: '/consultations',
            description: 'Create new consultation (after appointment approved)',
          },
          {
            method: 'PUT',
            path: '/consultations/:id',
            description: 'Update consultation notes & status',
          },
          {
            method: 'POST',
            path: '/consultations/:id/prescribe',
            description: 'Add prescription to consultation',
          },
          {
            method: 'GET',
            path: '/consultation-payments',
            description: 'List pending patient payments',
          },
          {
            method: 'POST',
            path: '/consultation-payments/:id/verify',
            description: 'Doctor verifies payment from patient',
          },
          {
            method: 'GET',
            path: '/billing-documents',
            description: 'List invoices & receipts generated',
          },
          {
            method: 'POST',
            path: '/billing-documents/generate',
            description: 'Generate invoice/receipt for consultation',
          },
          {
            method: 'GET',
            path: '/patients',
            description: 'List doctor\'s patients',
          },
          {
            method: 'GET',
            path: '/patients/:id',
            description: 'Get patient details & EHR',
          },
          {
            method: 'GET',
            path: '/leads',
            description: 'List CRM leads',
          },
          {
            method: 'POST',
            path: '/leads',
            description: 'Create new lead',
          },
          {
            method: 'POST',
            path: '/leads/:id/convert',
            description: 'Convert lead to patient',
          },
          {
            method: 'POST',
            path: '/messages',
            description: 'Send message to patient',
          },
          {
            method: 'GET',
            path: '/messages/:patientId',
            description: 'Get chat history with patient',
          },
          {
            method: 'GET',
            path: '/subscription',
            description: 'Get doctor\'s subscription status',
          },
          {
            method: 'POST',
            path: '/subscription/upload-receipt',
            description: 'Upload payment proof for renewal',
          },
          {
            method: 'GET',
            path: '/settings/profile',
            description: 'Get doctor profile settings',
          },
          {
            method: 'PUT',
            path: '/settings/profile',
            description: 'Update doctor profile',
          },
          {
            method: 'PUT',
            path: '/settings/payment-accounts',
            description: 'Configure payment accounts',
          },
          {
            method: 'PUT',
            path: '/settings/pricing',
            description: 'Set service prices & insurances',
          },
          {
            method: 'PUT',
            path: '/settings/reminders',
            description: 'Configure appointment reminders',
          },
          {
            method: 'GET',
            path: '/reports/revenue',
            description: 'Get revenue analytics',
          },
          {
            method: 'GET',
            path: '/reports/consultations',
            description: 'Get consultation statistics',
          },
        ]}
      />

      <APIGroup
        group="Public API"
        prefix="/api/book"
        color="teal"
        routes={[
          {
            method: 'GET',
            path: '/[doctorId]',
            description: 'Get doctor info & availability (public)',
          },
          {
            method: 'GET',
            path: '/[doctorId]/available-slots',
            description: 'Get available appointment times',
          },
          {
            method: 'POST',
            path: '/[doctorId]/book',
            description: 'Book appointment (creates patient if needed)',
          },
          {
            method: 'GET',
            path: '/invite/[token]',
            description: 'Get doctor info from invite link',
          },
          {
            method: 'POST',
            path: '/invite/[token]/book',
            description: 'Book via invitation link',
          },
        ]}
      />

      <APIGroup
        group="Patient API"
        prefix="/api/patient"
        color="teal"
        routes={[
          {
            method: 'GET',
            path: '/dashboard',
            description: 'Get patient dashboard (appointments, consultations)',
          },
          {
            method: 'GET',
            path: '/appointments',
            description: 'List patient\'s appointments',
          },
          {
            method: 'POST',
            path: '/appointments/:id/reschedule',
            description: 'Reschedule appointment',
          },
          {
            method: 'POST',
            path: '/appointments/:id/cancel',
            description: 'Cancel appointment',
          },
          {
            method: 'GET',
            path: '/consultations',
            description: 'List patient\'s consultations',
          },
          {
            method: 'GET',
            path: '/consultations/:id',
            description: 'Get consultation details & notes',
          },
          {
            method: 'GET',
            path: '/consultations/:id/prescriptions',
            description: 'Get prescriptions from consultation',
          },
          {
            method: 'GET',
            path: '/consultations/:id/billing',
            description: 'Get invoice/receipt for consultation',
          },
          {
            method: 'POST',
            path: '/consultations/:id/upload-payment',
            description: 'Upload payment proof',
          },
          {
            method: 'POST',
            path: '/messages',
            description: 'Send message to doctor',
          },
          {
            method: 'GET',
            path: '/messages/:doctorId',
            description: 'Get chat history with doctor',
          },
          {
            method: 'GET',
            path: '/profile',
            description: 'Get patient profile',
          },
          {
            method: 'PUT',
            path: '/profile',
            description: 'Update patient profile',
          },
        ]}
      />

      {/* Summary */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-4">API Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-bold text-indigo-600 mb-3">Admin Routes: 15</h4>
            <p className="text-sm text-slate-600">Doctors, subscriptions, payments, features, KPIs</p>
          </div>
          <div>
            <h4 className="font-bold text-emerald-600 mb-3">Doctor Routes: 34</h4>
            <p className="text-sm text-slate-600">Dashboard, appointments, consultations, payments, billing, CRM, settings</p>
          </div>
          <div>
            <h4 className="font-bold text-teal-600 mb-3">Public Routes: 5</h4>
            <p className="text-sm text-slate-600">Booking, availability, invite links</p>
          </div>
          <div>
            <h4 className="font-bold text-teal-600 mb-3">Patient Routes: 13</h4>
            <p className="text-sm text-slate-600">Dashboard, appointments, consultations, billing, messages</p>
          </div>
        </div>
        <div className="mt-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <p className="text-sm text-teal-800">
            <strong>Total: 67 API endpoints</strong> across all routes
          </p>
        </div>
      </div>
    </div>
  );

  // ==================== COMPONENT HELPERS ====================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-3 rounded-lg">
              <Database size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-slate-900">MedSaaS Venezuela</h1>
              <p className="text-slate-600 mt-1">Project Architecture & Database Design</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 border-b border-slate-300 overflow-x-auto">
            <TabButton id="tables" label="Database Tables" icon={Database} />
            <TabButton id="clinical" label="Clinical Flow" icon={Stethoscope} />
            <TabButton id="roles" label="User Roles" icon={Users} />
            <TabButton id="apis" label="API Routes" icon={Code} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {activeTab === 'tables' && <TablesSection />}
        {activeTab === 'clinical' && <ClinicalFlowSection />}
        {activeTab === 'roles' && <RolesSection />}
        {activeTab === 'apis' && <APISection />}
      </div>

      {/* Footer */}
      <div className="bg-slate-900 text-white py-8 mt-16">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-slate-400">
            Delta Medical — Multi-tenant CRM for Venezuelan Doctors
          </p>
          <p className="text-slate-500 text-sm mt-2">
            Stack: Next.js 15 · TypeScript · Tailwind CSS · Supabase · Vercel
          </p>
        </div>
      </div>
    </div>
  );
}

// ==================== HELPER COMPONENTS ====================

function DatabaseTable({ name, description, fields, color }) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    slate: 'bg-slate-50 border-slate-200 text-slate-900',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <div className="font-bold text-sm mb-1">{name}</div>
      <div className="text-xs opacity-75 mb-3">{description}</div>
      <div className="space-y-1">
        {fields.map((field, i) => (
          <div key={i} className="text-xs font-mono opacity-60">
            • {field}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowStep({ step, name, color }) {
  const colorMap = {
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    amber: 'bg-amber-100 text-amber-700 border-amber-300',
  };

  return (
    <div className={`rounded-lg border px-4 py-3 flex-shrink-0 ${colorMap[color]}`}>
      <div className="text-xs font-bold opacity-60">Step {step}</div>
      <div className="text-sm font-bold">{name}</div>
    </div>
  );
}

function DecisionBox({ title, items }) {
  return (
    <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50">
      <h5 className="font-bold text-emerald-900 mb-3">{title}</h5>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-emerald-800 flex gap-2">
            <span className="text-emerald-600 font-bold">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineItem({ day, time, event, color }) {
  const colorMap = {
    teal: 'text-teal-600',
    emerald: 'text-emerald-600',
  };

  return (
    <div>
      <div className={`font-bold text-sm ${colorMap[color]}`}>
        {day} • {time}
      </div>
      <div className="text-slate-700 text-sm mt-1">{event}</div>
    </div>
  );
}

function RoleCard({ role, path, icon: Icon, color, description, sections }) {
  const colorMap = {
    indigo: 'border-indigo-200 bg-indigo-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    teal: 'border-teal-200 bg-teal-50',
  };

  const textColorMap = {
    indigo: 'text-indigo-700',
    emerald: 'text-emerald-700',
    teal: 'text-teal-700',
  };

  const bgColorMap = {
    indigo: 'bg-indigo-100',
    emerald: 'bg-emerald-100',
    teal: 'bg-teal-100',
  };

  return (
    <div className={`rounded-xl border p-6 ${colorMap[color]}`}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`${bgColorMap[color]} p-2 rounded-lg`}>
              <Icon size={24} className={textColorMap[color]} />
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{role}</h3>
          </div>
          <p className="text-sm text-slate-700 font-mono mb-2">{path}</p>
          <p className="text-slate-700">{description}</p>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map((section, i) => (
          <div key={i}>
            <h4 className={`font-bold text-lg ${textColorMap[color]} mb-3`}>
              {section.title}
            </h4>
            <ul className="space-y-2 ml-4">
              {section.items.map((item, j) => (
                <li key={j} className="text-sm text-slate-700 flex gap-2">
                  <span className={`${textColorMap[color]} font-bold flex-shrink-0`}>
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function APIGroup({ group, prefix, color, routes }) {
  const bgColorMap = {
    indigo: 'bg-indigo-50 border-indigo-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    teal: 'bg-teal-50 border-teal-200',
  };

  const textColorMap = {
    indigo: 'text-indigo-700',
    emerald: 'text-emerald-700',
    teal: 'text-teal-700',
  };

  const badgeColorMap = {
    indigo: 'bg-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    teal: 'bg-teal-100 text-teal-700',
  };

  return (
    <div className={`rounded-xl border p-6 ${bgColorMap[color]}`}>
      <h3 className={`text-xl font-bold ${textColorMap[color]} mb-6`}>
        {group}
      </h3>

      <div className="space-y-3">
        {routes.map((route, i) => (
          <div
            key={i}
            className="bg-white rounded-lg p-4 border border-slate-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className={`${badgeColorMap[color]} px-3 py-1 rounded font-bold text-xs flex-shrink-0 h-fit`}>
                {route.method}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-bold text-slate-900">
                  {prefix}{route.path}
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  {route.description}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
