import { createFileRoute } from "@tanstack/react-router";
import { getDeadlines } from "@/services/deadlines";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Course, DeadlineItem } from "@/data/mockDeadlineItems";
import { cn } from "@/lib/utils";
import { Check, GraduationCap, Search, X } from "lucide-react";

const SELECTED_COURSES_STORAGE_KEY = "syllabusync.homework.selected-courses";
const VISIBLE_COURSES_STORAGE_KEY = "syllabusync.homework.visible-courses";
const COMPLETED_HOMEWORK_IDS_STORAGE_KEY = "syllabusync.homework.completed-ids";

type CourseCatalogEntry = {
  name: Course;
  number: string;
  hebrewName: string;
  aliases: string[];
};

const COURSE_CATALOG: CourseCatalogEntry[] = [
  {
    name: "Operating Systems",
    number: "02340123",
    hebrewName: "מערכות הפעלה",
    aliases: ["Operating Systems", "Operating System", "OS", "מערכות הפעלה", "02340123"],
  },
  {
    name: "ATAM",
    number: "02340118",
    hebrewName: "ארגון ותכנות המחשב",
    aliases: ["ATAM", "ארגון ותכנות המחשב", "02340118"],
  },
  {
    name: "Algorithms 1",
    number: "02340247",
    hebrewName: "אלגוריתמים 1",
    aliases: ["Algorithms 1", "Algorithms", "Algo 1", "אלגוריתמים 1", "02340247"],
  },
  {
    name: "System Programming",
    number: "02340124",
    hebrewName: "מבוא לתכנות מערכות",
    aliases: ["System Programming", "מבוא לתכנות מערכות", "02340124"],
  },
];

const COURSE_ORDER: Course[] = COURSE_CATALOG.map((course) => course.name);

type Tone = "urgent" | "upcoming" | "completed" | "expired";

function isBrowser() {
  return typeof window !== "undefined";
}

function readStoredList(key: string): string[] | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function uniqueCourses(courses: Course[]) {
  return COURSE_ORDER.filter((course) => courses.includes(course));
}

function getCourseInfo(course: Course) {
  return COURSE_CATALOG.find((entry) => entry.name === course);
}

function getAvailableHomeworkCourses(items: DeadlineItem[]) {
  const available = new Set<Course>();
  for (const item of items) {
    if (item.type === "Homework" && COURSE_ORDER.includes(item.course)) {
      available.add(item.course);
    }
  }
  return COURSE_ORDER.filter((course) => available.has(course));
}

function courseMatchesSearch(course: CourseCatalogEntry, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [course.name, course.number, course.hebrewName, ...course.aliases].some((term) =>
    term.toLowerCase().includes(normalizedQuery),
  );
}

function formatDueDate(item: DeadlineItem) {
  if (item.displayDate) {
    const normalized = item.displayDate.trim();
    if (/^[A-Za-z]{3},\s\w{3}\s\d{1,2},\s\d{4}\s·\s\d{2}:\d{2}$/.test(normalized)) {
      return normalized.replace(/^\w{3},\s*/, "").replace(" · ", " at ");
    }
  }

  const isoMatch = item.dueAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
  );

  if (isoMatch) {
    const [, year, month, day, hour, minute] = isoMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
    return `${dateLabel} at ${hour}:${minute}`;
  }

  const fallback = new Date(item.dueAt);
  if (Number.isNaN(fallback.getTime())) return item.displayDate || item.dueAt;

  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(fallback)} at ${new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fallback)}`;
}

function getTimeRemaining(dueAt: string) {
  const dueMs = new Date(dueAt).getTime();
  if (Number.isNaN(dueMs)) return { label: "Expired", tone: "expired" as Tone };

  const diffMs = dueMs - Date.now();
  if (diffMs <= 0) return { label: "Expired", tone: "expired" as Tone };

  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const days = Math.floor(diffMs / dayMs);
  const hours = Math.floor((diffMs % dayMs) / hourMs);

  if (days >= 1) {
    return {
      label: hours > 0 ? `${days}d ${hours}h left` : `${days}d left`,
      tone: days < 2 ? ("urgent" as Tone) : ("upcoming" as Tone),
    };
  }

  return {
    label: `${Math.max(1, Math.ceil(diffMs / hourMs))}h left`,
    tone: "urgent" as Tone,
  };
}

function getToneStyles(tone: Tone) {
  if (tone === "urgent") {
    return {
      border: "border-l-red-500",
      badge: "bg-red-50 text-red-700 ring-1 ring-red-100",
      time: "text-red-700",
      rowBg: "bg-white",
    };
  }
  if (tone === "completed") {
    return {
      border: "border-l-emerald-500",
      badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
      time: "text-emerald-800",
      rowBg: "bg-emerald-50/40",
    };
  }
  if (tone === "expired") {
    return {
      border: "border-l-slate-300",
      badge: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
      time: "text-slate-600",
      rowBg: "bg-white",
    };
  }
  return {
    border: "border-l-sky-500",
    badge: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
    time: "text-slate-900",
    rowBg: "bg-white",
  };
}

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      if (import.meta.env.SSR) {
        const { getAllDeadlines } = await import("../../server/lib/db");
        return await getAllDeadlines();
      }

      return await getDeadlines();
    } catch (error) {
      console.error("Deadlines loader failed, rendering empty dashboard", error);
      return [];
    }
  },
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

function Dashboard() {
  const items = Route.useLoaderData();
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  const homeworkItems = useMemo(
    () =>
      items
        .filter((item) => item.type === "Homework")
        .slice()
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
    [items],
  );

  const availableCourses = useMemo(() => getAvailableHomeworkCourses(items), [items]);

  const [selectedCourses, setSelectedCourses] = useState<Course[]>(availableCourses);
  const [visibleCourses, setVisibleCourses] = useState<Course[]>(availableCourses);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedSelected = readStoredList(SELECTED_COURSES_STORAGE_KEY);
    const storedVisible = readStoredList(VISIBLE_COURSES_STORAGE_KEY);
    const storedCompleted = readStoredList(COMPLETED_HOMEWORK_IDS_STORAGE_KEY);

    const selected =
      storedSelected === null
        ? availableCourses
        : uniqueCourses(
            storedSelected.filter((course): course is Course =>
              COURSE_ORDER.includes(course as Course),
            ) as Course[],
          );

    const visible =
      storedVisible === null
        ? selected
        : uniqueCourses(
            storedVisible.filter((course): course is Course => selected.includes(course as Course)) as Course[],
          );

    setSelectedCourses(selected);
    setVisibleCourses(visible);
    setCompletedIds(
      storedCompleted === null
        ? []
        : storedCompleted.filter((id) => homeworkItems.some((item) => item.id === id)),
    );
    setHydrated(true);
  }, [availableCourses, homeworkItems]);

  useEffect(() => {
    if (!hydrated || !isBrowser()) return;
    window.localStorage.setItem(SELECTED_COURSES_STORAGE_KEY, JSON.stringify(selectedCourses));
  }, [hydrated, selectedCourses]);

  useEffect(() => {
    if (!hydrated || !isBrowser()) return;
    window.localStorage.setItem(VISIBLE_COURSES_STORAGE_KEY, JSON.stringify(visibleCourses));
  }, [hydrated, visibleCourses]);

  useEffect(() => {
    if (!hydrated || !isBrowser()) return;
    window.localStorage.setItem(COMPLETED_HOMEWORK_IDS_STORAGE_KEY, JSON.stringify(completedIds));
  }, [completedIds, hydrated]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!searchContainerRef.current) return;
      if (!searchContainerRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  const selectedCourseList = useMemo(
    () => uniqueCourses(selectedCourses).filter((course) => COURSE_ORDER.includes(course)),
    [selectedCourses],
  );

  const visibleCourseList = useMemo(
    () => selectedCourseList.filter((course) => visibleCourses.includes(course)),
    [selectedCourseList, visibleCourses],
  );

  const completedIdSet = useMemo(() => new Set(completedIds), [completedIds]);

  const remainingHomework = useMemo(
    () =>
      homeworkItems.filter(
        (item) =>
          selectedCourseList.includes(item.course) &&
          visibleCourseList.includes(item.course) &&
          !completedIdSet.has(item.id),
      ),
    [homeworkItems, selectedCourseList, visibleCourseList, completedIdSet],
  );

  const completedHomework = useMemo(
    () =>
      homeworkItems.filter(
        (item) => selectedCourseList.includes(item.course) && completedIdSet.has(item.id),
      ),
    [homeworkItems, selectedCourseList, completedIdSet],
  );

  const urgentCount = useMemo(
    () => remainingHomework.filter((item) => getTimeRemaining(item.dueAt).tone === "urgent").length,
    [remainingHomework],
  );

  const suggestions = useMemo(() => {
    const base = COURSE_CATALOG.filter((course) => !selectedCourseList.includes(course.name));
    return base.filter((course) => courseMatchesSearch(course, searchQuery));
  }, [searchQuery, selectedCourseList]);

  const noSelectedCourses = selectedCourseList.length === 0;
  const noVisibleCourses = !noSelectedCourses && visibleCourseList.length === 0;
  const noRemainingHomework = !noSelectedCourses && !noVisibleCourses && remainingHomework.length === 0;

  const addCourse = (course: Course) => {
    setSelectedCourses((previous) =>
      previous.includes(course) ? previous : uniqueCourses([...previous, course]),
    );
    setVisibleCourses((previous) =>
      previous.includes(course) ? previous : uniqueCourses([...previous, course]),
    );
  };

  const removeCourse = (course: Course) => {
    setSelectedCourses((previous) => previous.filter((value) => value !== course));
    setVisibleCourses((previous) => previous.filter((value) => value !== course));
  };

  const toggleCourseVisibility = (course: Course) => {
    setVisibleCourses((previous) =>
      previous.includes(course)
        ? previous.filter((value) => value !== course)
        : uniqueCourses([...previous, course]),
    );
  };

  const markDone = (id: string) => {
    setCompletedIds((previous) => (previous.includes(id) ? previous : [...previous, id]));
  };

  const markNotDone = (id: string) => {
    setCompletedIds((previous) => previous.filter((value) => value !== id));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((previous) =>
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id],
    );
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-50 grid grid-cols-[320px_minmax(0,1fr)]">
      <aside className="h-full min-h-0 border-r border-border bg-white px-4 py-4">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
                <GraduationCap className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">SyllabuSync</div>
                <div className="text-xs text-muted-foreground">Homework control center</div>
              </div>
            </div>

            <div className="mt-4" ref={searchContainerRef}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onFocus={() => setSearchOpen(true)}
                  onClick={() => setSearchOpen(true)}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search course name or number..."
                  className="h-10 w-full rounded-xl border border-border bg-white pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-slate-400"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              {searchOpen ? (
                <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-border bg-white p-1 shadow-sm">
                  {suggestions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No matching courses.</div>
                  ) : (
                    suggestions.map((course) => (
                      <button
                        key={course.name}
                        type="button"
                        onClick={() => {
                          addCourse(course.name);
                          setSearchQuery("");
                          setSearchOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 active:bg-slate-100"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{course.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground" dir="auto">
                            {course.number} · {course.hebrewName}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">Add</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto">
            <div className="text-xs font-semibold text-muted-foreground">My Courses</div>
            <div className="mt-2 space-y-1.5">
              {selectedCourseList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                  No courses selected.
                </div>
              ) : (
                selectedCourseList.map((course) => {
                  const isVisible = visibleCourses.includes(course);
                  const courseInfo = getCourseInfo(course);
                  return (
                    <div
                      key={course}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition-colors",
                        isVisible
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-border bg-slate-100 text-muted-foreground",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleCourseVisibility(course)}
                        className="min-w-0 flex-1 text-left active:opacity-80"
                      >
                        <span className="flex min-w-0 items-start gap-1.5">
                          {isVisible ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{course}</span>
                            {courseInfo ? (
                              <span
                                className={cn(
                                  "mt-0.5 block truncate text-[11px]",
                                  isVisible ? "text-sky-700/70" : "text-muted-foreground",
                                )}
                                dir="auto"
                              >
                                {courseInfo.number} · {courseInfo.hebrewName}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeCourse(course);
                        }}
                        className="ml-2 shrink-0 rounded-full bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 active:scale-95"
                      >
                        x
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-0 overflow-hidden flex flex-col p-4">
        <header className="shrink-0 border-b border-border pb-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Homework</h1>
            <span className="text-sm text-muted-foreground">
              {remainingHomework.length} remaining · {completedHomework.length} completed
            </span>
            {urgentCount > 0 ? <span className="text-sm text-red-700">· {urgentCount} urgent</span> : null}
          </div>
        </header>

        <section className="mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-white">
          <div className="h-full min-h-0 overflow-auto p-3">
            {noSelectedCourses ? (
              <EmptyState
                title="Add courses from the sidebar to see homework deadlines."
                description="Use the search input to add your courses."
              />
            ) : noVisibleCourses ? (
              <EmptyState
                title="Turn on a course from My Courses to see its homework."
                description="Click an inactive course row to make it visible."
              />
            ) : (
              <>
                {noRemainingHomework ? (
                  <EmptyState
                    title="No remaining homework for your active courses."
                    description="Completed items can still be viewed below."
                  />
                ) : (
                  <div className="space-y-2">
                    {remainingHomework.map((item) => {
                      const remaining = getTimeRemaining(item.dueAt);
                      const tone = getToneStyles(remaining.tone);
                      return (
                        <HomeworkRow
                          key={item.id}
                          item={item}
                          dueLabel={formatDueDate(item)}
                          remainingLabel={remaining.label}
                          statusLabel={
                            remaining.tone === "urgent"
                              ? "Urgent"
                              : remaining.tone === "expired"
                                ? "Expired"
                                : "Upcoming"
                          }
                          borderClass={tone.border}
                          badgeClass={tone.badge}
                          timeClass={tone.time}
                          rowBgClass={tone.rowBg}
                          expanded={expandedIds.includes(item.id)}
                          actionLabel="Mark as done"
                          onToggleExpanded={() => toggleExpanded(item.id)}
                          onAction={() => markDone(item.id)}
                        />
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCompleted((previous) => !previous)}
                    className="rounded-full border border-border bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 active:scale-[0.99]"
                  >
                    {showCompleted
                      ? `Hide completed (${completedHomework.length})`
                      : `Show completed (${completedHomework.length})`}
                  </button>

                  {showCompleted ? (
                    <div className="mt-3 space-y-2">
                      {completedHomework.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                          No completed homework yet.
                        </div>
                      ) : (
                        completedHomework.map((item) => {
                          const tone = getToneStyles("completed");
                          return (
                            <HomeworkRow
                              key={item.id}
                              item={item}
                              dueLabel={formatDueDate(item)}
                              remainingLabel="Done"
                              statusLabel="Completed"
                              borderClass={tone.border}
                              badgeClass={tone.badge}
                              timeClass={tone.time}
                              rowBgClass={tone.rowBg}
                              expanded={expandedIds.includes(item.id)}
                              actionLabel="Mark as not done"
                              onToggleExpanded={() => toggleExpanded(item.id)}
                              onAction={() => markNotDone(item.id)}
                            />
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-slate-50 px-4 py-6 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function HomeworkRow({
  item,
  dueLabel,
  remainingLabel,
  statusLabel,
  borderClass,
  badgeClass,
  timeClass,
  rowBgClass,
  expanded,
  actionLabel,
  onToggleExpanded,
  onAction,
}: {
  item: DeadlineItem;
  dueLabel: string;
  remainingLabel: string;
  statusLabel: string;
  borderClass: string;
  badgeClass: string;
  timeClass: string;
  rowBgClass: string;
  expanded: boolean;
  actionLabel: string;
  onToggleExpanded: () => void;
  onAction: () => void;
}) {
  return (
    <article className={cn("rounded-xl border border-border border-l-4 px-3.5 py-3", borderClass, rowBgClass)}>
      <button
        type="button"
        onClick={onToggleExpanded}
        className="grid w-full gap-2 text-left sm:grid-cols-[10.5rem_minmax(0,1fr)_auto] sm:items-center"
      >
        <div className={cn("text-xl font-bold tracking-tight sm:text-2xl", timeClass)}>{remainingLabel}</div>

        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900 sm:text-[15px]">
            {item.course} · {item.title}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Due {dueLabel}</div>
        </div>

        <div className="flex items-center gap-2 justify-self-end">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", badgeClass)}>{statusLabel}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAction();
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              actionLabel === "Mark as done"
                ? "border-slate-200 bg-slate-900 text-white hover:bg-slate-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
            )}
          >
            {actionLabel}
          </button>
        </div>
      </button>

      {expanded ? (
        <div className="mt-3 rounded-lg border border-border bg-white/70 p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailRow label="Course" value={item.course} />
            <DetailRow label="Title" value={item.title} />
            <DetailRow label="Due date/time" value={dueLabel} />
            <DetailRow label="Description" value={item.description} />
          </div>
          <p className="mt-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Source sentence:</span> {item.sourceSentence}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-slate-900">{value}</p>
    </div>
  );
}