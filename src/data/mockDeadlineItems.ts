export type DeadlineType =
  | "Homework"
  | "Quiz/Exam"
  | "Activity/Event"
  | "Registration"
  | "Announcement";

export type DeadlineStatus = "Upcoming" | "Urgent" | "Expired" | "Completed";

export type Course = "Operating Systems" | "Algorithms 1" | "ATAM" | "General";

export interface DeadlineItem {
  id: string;
  course: Course;
  title: string;
  type: DeadlineType;
  dueAt: string; // ISO
  displayDate: string;
  description: string;
  status: DeadlineStatus;
  sourceSentence: string;
}

export const mockDeadlineItems: DeadlineItem[] = [
  {
    id: "1",
    course: "Operating Systems",
    title: "HW3",
    type: "Homework",
    dueAt: "2026-07-06T23:59:00",
    displayDate: "Mon, Jul 6, 2026 · 23:59",
    description: "Submit HW3 via the course site.",
    status: "Urgent",
    sourceSentence: "The submission deadline is July 6th at 23:59.",
  },
  {
    id: "2",
    course: "Algorithms 1",
    title: "Quiz 1",
    type: "Quiz/Exam",
    dueAt: "2026-07-08T10:00:00",
    displayDate: "Wed, Jul 8, 2026 · 10:00",
    description: "Covers divide-and-conquer and graph basics.",
    status: "Upcoming",
    sourceSentence: "Quiz 1 will take place on Wednesday at 10:00.",
  },
  {
    id: "3",
    course: "ATAM",
    title: "Lab 2 Report",
    type: "Homework",
    dueAt: "2026-07-10T12:00:00",
    displayDate: "Fri, Jul 10, 2026 · 12:00",
    description: "Submit the ATAM lab report and assembly results.",
    status: "Upcoming",
    sourceSentence: "Lab 2 report must be submitted by Friday at noon.",
  },
  {
    id: "4",
    course: "General",
    title: "Semester Registration Window",
    type: "Announcement",
    dueAt: "2026-07-12T23:59:00",
    displayDate: "Sun, Jul 12, 2026 · 23:59",
    description: "Important registration notice for all students.",
    status: "Expired",
    sourceSentence: "Registration closes on July 12.",
  },
];
