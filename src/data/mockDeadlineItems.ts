export type DeadlineType =
  | "Homework"
  | "Quiz/Exam"
  | "Activity/Event"
  | "Registration"
  | "Announcement";

export type DeadlineStatus = "Upcoming" | "Urgent" | "Expired" | "Completed";

export type Course =
  | "Data Structures"
  | "Operating Systems"
  | "Digital Systems"
  | "Linear Algebra"
  | "General";

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
    course: "Data Structures",
    title: "HW2",
    type: "Homework",
    dueAt: "2025-05-22T23:59:00",
    displayDate: "Thu, May 22, 2025 · 23:59",
    description: "Complete problems 1–5 from Chapter 3 and submit on the course site.",
    status: "Urgent",
    sourceSentence: "HW2 must be submitted by Thursday at 23:59.",
  },
  {
    id: "2",
    course: "Operating Systems",
    title: "Wet Assignment",
    type: "Homework",
    dueAt: "2025-05-25T23:59:00",
    displayDate: "Sun, May 25, 2025 · 23:59",
    description: "Implement the file system module and write the report.",
    status: "Upcoming",
    sourceSentence: "The wet assignment deadline is Sunday at 23:59.",
  },
  {
    id: "3",
    course: "Digital Systems",
    title: "Lab Report",
    type: "Homework",
    dueAt: "2025-05-26T12:00:00",
    displayDate: "Mon, May 26, 2025 · 12:00",
    description: "Submit the lab report and simulation results.",
    status: "Upcoming",
    sourceSentence: "The lab report should be submitted by Monday at 12:00.",
  },
  {
    id: "4",
    course: "Linear Algebra",
    title: "Quiz 2",
    type: "Quiz/Exam",
    dueAt: "2025-05-28T10:30:00",
    displayDate: "Wed, May 28, 2025 · 10:30",
    description: "Covers lectures 1–7.",
    status: "Upcoming",
    sourceSentence: "Quiz 2 will take place on Wednesday at 10:30.",
  },
  {
    id: "5",
    course: "General",
    title: "Hackathon Registration",
    type: "Registration",
    dueAt: "2025-05-20T23:59:00",
    displayDate: "Tue, May 20, 2025 · 23:59",
    description: "Register your team for the university hackathon.",
    status: "Expired",
    sourceSentence: "Registration for the hackathon closes on May 20.",
  },
  {
    id: "6",
    course: "General",
    title: "Resume Workshop",
    type: "Activity/Event",
    dueAt: "2025-05-21T14:00:00",
    displayDate: "Wed, May 21, 2025 · 14:00",
    description: "Learn how to build a strong resume.",
    status: "Upcoming",
    sourceSentence: "The resume workshop will take place on May 21 at 14:00.",
  },
];
