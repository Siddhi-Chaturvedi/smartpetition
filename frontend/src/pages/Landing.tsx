import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Bot, Building2, Bus, ChevronDown, Droplets, GraduationCap, HeartPulse,
  Lamp, Mail, Menu, MapPin, Phone, Route, ShieldCheck, Sparkles, Trash2, X, Zap, Timer, BarChart3, Users,
} from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth, homePathFor } from '../context/AuthContext'

const FEATURES = [
  { icon: Sparkles, title: 'AI Category & Priority Suggestions', body: 'A trained text-classification model recommends the right category and a transparent urgency engine flags hazards — every recommendation comes with a human-readable explanation.' },
  { icon: Bot, title: 'Duplicate Detection', body: 'Before you submit, SmartPetition shows similar open complaints so the city sees one clear signal instead of noise. Nothing is ever auto-rejected — a human reviews every match.' },
  { icon: Route, title: 'Automatic Department Routing', body: 'Grievances are routed to the responsible department based on category, jurisdiction and configured rules. Uncertain cases go to a triage queue, never into a black hole.' },
  { icon: Timer, title: 'SLA Deadlines & Escalation', body: 'Every case gets a deadline. A background scheduler escalates overdue cases and notifies officers and administrators automatically — even when nobody is watching a dashboard.' },
  { icon: BarChart3, title: 'Operational Analytics', body: 'Administrators see category trends, department workload, resolution times and SLA compliance — all computed from live database records, exportable to CSV.' },
  { icon: ShieldCheck, title: 'Transparent Tracking', body: 'A unique tracking ID, a public timeline of every status change, and in-app notifications keep you informed from submission to resolution.' },
]

const STEPS = [
  { n: '01', title: 'Submit your grievance', body: 'Describe the issue in your own words. Add location and photos. Before you submit, you see similar open complaints and an AI-suggested category and priority.' },
  { n: '02', title: 'We analyze & route it', body: 'The AI classifies the complaint, scores urgency from safety and impact signals, and routes it to the right department with an SLA deadline. Uncertain cases go to human triage.' },
  { n: '03', title: 'Officers act & update', body: 'Department officers accept the case, post progress updates you can see, and record a resolution summary with evidence when work is done.' },
  { n: '04', title: 'You verify & close', body: 'Check the resolution, rate the service, and close the case — or reopen it within 14 days if the problem persists. Overdue cases escalate automatically.' },
]

const CATEGORIES = [
  { icon: Route, name: 'Roads', desc: 'Potholes, street lights, footpaths, traffic signals' },
  { icon: Droplets, name: 'Water Supply', desc: 'No supply, leaks, contamination, sewage' },
  { icon: Zap, name: 'Electricity', desc: 'Power cuts, transformers, exposed wiring' },
  { icon: Trash2, name: 'Sanitation', desc: 'Garbage, drains, public toilets, mosquitoes' },
  { icon: Bus, name: 'Transport', desc: 'Buses, metro, autos, parking, shelters' },
  { icon: GraduationCap, name: 'Education', desc: 'Schools, teachers, mid-day meals, scholarships' },
  { icon: HeartPulse, name: 'Healthcare', desc: 'Hospitals, clinics, ambulances, vaccination' },
  { icon: Building2, name: 'Other Civic', desc: 'Certificates, property tax, encroachments' },
]

const FAQS = [
  { q: 'How do I track my grievance after submitting?', a: 'Every submission receives a unique tracking ID (e.g. SP-20261025-A1B2C3D4). Sign in and open "My Grievances" to see the live status, the full timeline of actions taken, officer updates and the SLA deadline.' },
  { q: 'Is the AI making the final decision on my complaint?', a: 'No. The AI only recommends a category, priority and department, and every recommendation is explained in plain language. Authorized officers and administrators make all binding decisions, and they can override the AI — overrides are recorded in the audit log.' },
  { q: 'What happens if my complaint looks like an existing one?', a: 'You will see similar open complaints before submitting, with similarity scores and matched keywords. You can still submit — the system never auto-rejects a complaint for looking similar. Staff review and link confirmed duplicates while preserving both records.' },
  { q: 'What if my issue is an emergency?', a: 'For life-threatening emergencies, contact emergency services (112 in India) immediately. SmartPetition flags critical hazards for fast triage and escalation, but it does not replace emergency response services.' },
  { q: 'What is the resolution deadline?', a: 'Deadlines follow configured SLA rules — by default 24 hours for critical, 48 for high and 72 for standard priorities, customizable per category and department. Cases that miss their deadline are escalated automatically and appear in overdue dashboards.' },
  { q: 'Can I reopen a case that was closed?', a: 'Yes. If the problem persists you can reopen a resolved or closed grievance within 14 days (up to two reopens). Reopening notifies the responsible department and puts the case back in the active queue with a fresh deadline.' },
]

export default function Landing() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const dashboard = homePathFor(user)

  return (
    <div className="min-h-screen bg-page">
      {/* ============ header ============ */}
      <header className="sticky top-0 z-50 bg-obsidian text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="SmartPetition home">
            <Logo className="h-9 w-9" />
            <span className="text-lg font-bold tracking-tight">
              Smart<span className="text-[#5B9BFF]">Petition</span>
            </span>
          </Link>
          <nav className="ml-6 hidden items-center gap-5 text-sm font-medium text-slate-300 md:flex" aria-label="Main">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#how-it-works" className="hover:text-white">How It Works</a>
            <a href="#categories" className="hover:text-white">Categories</a>
            <a href="#transparency" className="hover:text-white">Transparency</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <a href="#contact" className="hover:text-white">Contact</a>
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            {user ? (
              <Link to={dashboard} className="btn-primary">Go to Dashboard <ArrowRight className="h-4 w-4" /></Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 hover:text-white">
                  Log in
                </Link>
                <Link to="/register" className="btn-primary !py-2">Create account</Link>
              </>
            )}
          </div>
          <button
            type="button"
            className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10 md:hidden"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu" aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-white/10 px-4 pb-4 pt-2 md:hidden" aria-label="Mobile">
            {['features', 'how-it-works', 'categories', 'transparency', 'faq', 'contact'].map(id => (
              <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}
                 className="block rounded-lg px-3 py-2.5 text-sm font-medium capitalize text-slate-300 hover:bg-white/5 hover:text-white">
                {id.replace('-', ' ')}
              </a>
            ))}
            <div className="mt-2 flex gap-2">
              {user ? (
                <Link to={dashboard} onClick={() => setMenuOpen(false)} className="btn-primary flex-1">Dashboard</Link>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMenuOpen(false)} className="btn-secondary flex-1 !bg-white/10 !text-white !border-white/20">Log in</Link>
                  <Link to="/register" onClick={() => setMenuOpen(false)} className="btn-primary flex-1">Register</Link>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* ============ hero ============ */}
      <section className="bg-obsidian pb-20 pt-14 text-white sm:pt-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-[#8FB8FF]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              AI-powered civic grievance management
            </p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Your complaint, <span className="text-[#5B9BFF]">understood</span>,
              routed and <span className="text-emerald-400">resolved</span> — transparently.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Civic grievances get lost in the wrong departments, repeated without link, and closed without
              deadlines. SmartPetition reads every complaint with AI, recommends its category and urgency,
              detects duplicates, routes it to the right department, enforces SLA deadlines with automatic
              escalation — and lets you track every step with a public timeline.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={user && user.role === 'citizen' ? '/submit' : '/register'} className="btn-primary !px-6 !py-3 !text-base">
                Submit a Grievance <ArrowRight className="h-5 w-5" />
              </Link>
              <Link to={user ? '/grievances' : '/login'} className="btn-secondary !px-6 !py-3 !text-base !bg-white/10 !border-white/20 !text-white hover:!bg-white/20">
                Track a Grievance
              </Link>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6">
              {[
                ['8', 'civic categories'],
                ['24×7', 'automated SLA monitoring'],
                ['100%', 'actions audit-logged'],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="text-xl font-bold text-white">{v}</dd>
                  <dd className="text-xs text-slate-400">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* hero visual: mock tracking card */}
          <div className="relative mx-auto w-full max-w-md" aria-hidden>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs text-[#8FB8FF]">SP-20261025-4F2A9C1B</p>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">In Progress</span>
              </div>
              <p className="mt-3 text-sm font-semibold">Potholes on main road causing accidents</p>
              <div className="mt-4 space-y-3">
                {[
                  ['Submitted', 'AI: roads (94%) • priority high', true],
                  ['Routed', 'Roads & Infrastructure • auto-assigned', true],
                  ['In progress', 'Repair crew scheduled — officer update', true],
                  ['Deadline', 'SLA 72h • 31h remaining', false],
                ].map(([t, s, done]) => (
                  <div key={t as string} className="flex items-start gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${done ? 'bg-emerald-400' : 'bg-[#5B9BFF]'}`} />
                    <div>
                      <p className="text-xs font-semibold text-white">{t}</p>
                      <p className="text-[11px] text-slate-400">{s}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -right-3 -top-4 rotate-3 rounded-xl border border-white/10 bg-[#0066F5] px-3 py-2 text-xs font-bold shadow-lg">
              AI confidence 94%
            </div>
          </div>
        </div>
      </section>

      {/* ============ features ============ */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">A grievance system that actually works</h2>
          <p className="mt-3 text-muted">
            Six capabilities working together — from the moment a citizen types a complaint to the day it is
            verifiably resolved.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => (
            <article key={f.title} className="card p-6 transition-shadow hover:shadow-card-hover">
              <div className="mb-4 inline-flex rounded-lg bg-ice p-2.5 text-primary" aria-hidden>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ============ how it works ============ */}
      <section id="how-it-works" className="bg-ice py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <p className="mt-3 text-muted">Four steps, full transparency, zero black boxes.</p>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(s => (
              <li key={s.n} className="card relative p-6">
                <span className="text-3xl font-extrabold text-primary/20">{s.n}</span>
                <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============ categories ============ */}
      <section id="categories" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Complaint categories</h2>
          <p className="mt-3 text-muted">
            The AI classifier is trained to recognize these civic domains and route each one to its responsible department.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map(c => (
            <div key={c.name} className="card flex items-start gap-3.5 p-5">
              <span className="rounded-lg bg-ice p-2 text-primary" aria-hidden><c.icon className="h-5 w-5" /></span>
              <div>
                <h3 className="text-sm font-semibold">{c.name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ transparency ============ */}
      <section id="transparency" className="bg-obsidian py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Accountability by design</h2>
              <p className="mt-4 leading-relaxed text-slate-300">
                Trust is earned with evidence. Every recommendation, assignment, status change and override in
                SmartPetition is recorded permanently — who did what, when, and why.
              </p>
              <ul className="mt-6 space-y-4">
                {[
                  [ShieldCheck, 'AI advises, humans decide', 'Predictions are stored separately from official decisions. Overrides require a reason and are audited.'],
                  [Users, 'Role-based access, enforced server-side', 'Citizens see only their cases and never internal notes. Officers are scoped to their department. Admins see system-wide operations.'],
                  [BarChart3, 'Live, honest metrics', 'Dashboards query the real database: resolution times, SLA compliance, reopen rates, citizen feedback — no vanity numbers.'],
                  [MapPin, 'Deadlines that bite', 'A background scheduler monitors every open case. Miss a deadline and the system escalates and notifies automatically.'],
                ].map(([Icon, t, b]) => {
                  const I = Icon as typeof ShieldCheck
                  const title = t as string
                  const body = b as string
                  return (
                    <li key={title} className="flex gap-3.5">
                      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#8FB8FF]" aria-hidden>
                        <I className="h-4.5 w-4.5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{title}</p>
                        <p className="mt-0.5 text-sm text-slate-400">{body}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Audit trail (excerpt)</p>
              <div className="space-y-3 font-mono text-[11px] leading-relaxed">
                {[
                  ['09:14:02', 'grievance.created', 'citizen → SP-…9C1B'],
                  ['09:14:03', 'ai.classified', 'roads @ 0.94 (ml_model v1)'],
                  ['09:14:03', 'grievance.auto_routed', 'Roads & Infrastructure'],
                  ['10:02:41', 'grievance.status_changed', 'submitted → in_progress'],
                  ['11:47:19', 'comment.added', 'officer → citizen-visible'],
                  ['+51h', 'grievance.status_changed', 'in_progress → resolved'],
                  ['+52h', 'feedback.submitted', 'rating 5/5'],
                ].map(([t, a, d]) => (
                  <div key={t + a} className="flex gap-3 rounded-lg bg-black/20 px-3 py-2">
                    <span className="text-slate-500">{t}</span>
                    <span className="text-[#8FB8FF]">{a}</span>
                    <span className="ml-auto text-slate-400">{d}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Every entry above is a real row in the audit_logs table — exportable and queryable by administrators.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">Frequently asked questions</h2>
        <div className="mt-10 space-y-3">
          {FAQS.map((f, i) => (
            <div key={f.q} className="card overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
              >
                <span className="text-sm font-semibold">{f.q}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${openFaq === i ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {openFaq === i && <p className="border-t border-border px-5 py-4 text-sm leading-relaxed text-muted">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* ============ contact + footer ============ */}
      <footer id="contact" className="border-t border-border bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo className="h-9 w-9" />
              <span className="text-lg font-bold text-ink">Smart<span className="text-primary">Petition</span></span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              An automated grievance management system using AI and DevOps — built for transparency,
              accountability and measurable resolution.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Contact</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-ink">
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted" aria-hidden /> Helpdesk: 1800-000-000 (toll-free)</li>
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted" aria-hidden /> support@smartpetition.example.org</li>
              <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted" aria-hidden /> Civic Centre, Chennai, Tamil Nadu</li>
              <li className="flex items-center gap-2"><Lamp className="h-4 w-4 text-muted" aria-hidden /> Emergency? Call 112 — SmartPetition is not an emergency service.</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Quick links</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/register" className="text-primary hover:underline">Create a citizen account</Link></li>
              <li><Link to="/login" className="text-primary hover:underline">Officer / Admin login</Link></li>
              <li><a href="#how-it-works" className="text-primary hover:underline">How it works</a></li>
              <li><a href="#faq" className="text-primary hover:underline">FAQ</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border py-5 text-center text-xs text-muted">
          © {new Date().getFullYear()} SmartPetition — demonstration project. AI recommendations are advisory and never replace official decisions.
        </div>
      </footer>
    </div>
  )
}
