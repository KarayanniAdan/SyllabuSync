export type DeadlineType =
  | "Homework"
  | "Quiz/Exam"
  | "Activity/Event"
  | "Registration"
  | "Announcement";

export type DeadlineStatus = "Upcoming" | "Urgent" | "Expired" | "Completed";

export type DeadlineCategory = "Course" | "Other";

export type Course =
  | "Numerical Algorithms"
  | "Introduction to Artificial Intelligence"
  | "Compilation Theory"
  | "Physics 2MM"
  | "Introduction to Computer Networks"
  | "Introduction to Computer Science"
  | "Introduction to Set Theory and Automata for CS"
  | "Infinitesimal Calculus 1M"
  | "Algebra AM"
  | "General";

export interface DeadlineItem {
  id: string;
  category: DeadlineCategory;
  course: Course;
  title: string;
  type: DeadlineType;
  dueAt: string; // ISO
  displayDate: string;
  description: string;
  status: DeadlineStatus;
  sourceSentence: string;
}
