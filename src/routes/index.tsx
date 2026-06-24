import { createFileRoute } from "@tanstack/react-router";
import { getDeadlines } from "@/services/deadlines";
import { useMemo, useState } from "react";
import {
  Bell,
  Eye,
  EyeOff,
  Cpu,
  FileText,
  Briefcase,
  LayoutGrid,
  GraduationCap,
  Calendar,
  Star,
  Sparkles,
} from "lucide-react";
import type { Course, DeadlineItem, DeadlineStatus } from "@/data/mockDeadlineItems";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  loader: () => getDeadlines(),
  head: () => ({
    meta: [
      { title: "SyllabuSync — Academic Deadlines Dashboard" },
      {
        name: "description",
        content:
          "SyllabuSync helps university students track homework, quizzes, events, and academic deadlines in one organized dashboard.",
      },
      { property: "og:title", content: "SyllabuSync — Academic Deadlines" },
      {
        property: "og:description",
        content: "All your academic deadlines, organized in one place.",
      },
    ],
  }),
  component: Dashboard,
});

const COURSES: {
  name: Course | "All Courses";
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { name: "All Courses", icon: LayoutGrid },
  { name: "Operating Systems", icon: Cpu },
  { name: "Algorithms 1", icon: FileText },
  { name: "ATAM", icon: Cpu },
  { name: "General", icon: Briefcase },
];

const courseStyles: Record<
  Course,
  { text: string; bg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "Operating Systems": { text: "text-emerald-600", bg: "bg-emerald-50", icon: Cpu },
  "Algorithms 1": { text: "text-sky-600", bg: "bg-sky-50", icon: FileText },
  ATAM: { text: "text-violet-600", bg: "bg-violet-50", icon: Cpu },
  General: { text: "text-slate-600", bg: "bg-amber-50", icon: Star },
};

const statusStyles: Record<DeadlineStatus, string> = {
  Upcoming: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  Urgent: "bg-red-50 text-red-700 ring-1 ring-red-100",
  Expired: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Completed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
};

function Dashboard() {
  const items = Route.useLoaderData();
  const [course, setCourse] = useState<Course | "All Courses">("All Courses");
  const [showExpired, setShowExpired] = useState(false);

  const expiredCount = useMemo(() => items.filter((i) => i.status === "Expired").length, [items]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (course !== "All Courses" && i.course !== course) return false;
      if (!showExpired && i.status === "Expired") return false;
      return true;
    });
  }, [items, course, showExpired]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-72 shrink-0 flex-col border-r border-border bg-white px-5 py-7">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold leading-tight">SyllabuSync</div>
            <div className="text-xs text-muted-foreground">Academic deadlines hub</div>
          </div>
        </div>

        <div className="mt-9">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Courses
          </div>
          <nav className="mt-3 flex flex-col gap-1">
            {COURSES.map((c) => {
              const Icon = c.icon;
              const active = course === c.name;
              return (
                <button
                  key={c.name}
                  onClick={() => setCourse(c.name)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-[var(--primary-soft)] text-primary"
                      : "text-foreground/80 hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto rounded-2xl border border-border bg-secondary/50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Stay on top of your
          </div>
          <p className="mt-1 text-sm text-muted-foreground">academic deadlines.</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              Upcoming Academic Deadlines
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              All your academic deadlines, organized in one place.
            </p>
          </div>
          <button className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-primary/30 bg-white px-4 py-2 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-[var(--primary-soft)]">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Reminders</span>
          </button>
        </header>

        <div className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span>{" "}
            deadline
            {filtered.length === 1 ? "" : "s"}
            {!showExpired && expiredCount > 0 ? ` · ${expiredCount} expired hidden` : ""}
          </p>
          <button
            onClick={() => setShowExpired((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {showExpired ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showExpired ? "Hide Expired" : "Show Expired"}
          </button>
        </div>

        {/* Items */}
        <section className="mt-6 flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-white p-12 text-center">
              <p className="text-sm font-medium">No deadlines match your filters.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try selecting another course or showing expired items.
              </p>
            </div>
          ) : (
            filtered.map((item) => <DeadlineCard key={item.id} item={item} />)
          )}
        </section>
      </main>
    </div>
  );
}

function DeadlineCard({ item }: { item: DeadlineItem }) {
  const cs = courseStyles[item.course] ?? courseStyles.General;
  const Icon = cs.icon;
  const [datePart, timePart] = item.displayDate.split(" · ");
  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-5 rounded-2xl border border-border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_6px_24px_-12px_rgba(15,23,42,0.15)] sm:p-6">
      <div className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl", cs.bg)}>
        <Icon className={cn("h-6 w-6", cs.text)} />
      </div>

      <div className="min-w-0">
        <div className={cn("text-sm font-medium", cs.text)}>{item.course}</div>
        <h3 className="mt-0.5 truncate text-lg font-semibold text-foreground">{item.title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{item.description}</p>
        <p className="mt-2 text-xs text-muted-foreground/80">
          <span className="font-medium text-muted-foreground">Source:</span> “{item.sourceSentence}”
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
          {item.type}
        </div>
      </div>

      <div className="flex w-32 shrink-0 flex-col items-end border-l border-border pl-5 text-right sm:w-40">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{datePart}</span>
        </div>
        {timePart && <div className="mt-1 text-sm text-muted-foreground">{timePart}</div>}
        <div
          className={cn(
            "mt-3 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
            statusStyles[item.status],
          )}
        >
          {item.status}
        </div>
      </div>
    </article>
  );
}
