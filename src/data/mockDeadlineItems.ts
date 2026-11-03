export type DeadlineType =
  | "Homework"
  | "Quiz/Exam"
  | "Activity/Event"
  | "Registration"
  | "Announcement";

export type DeadlineStatus = "Upcoming" | "Urgent" | "Expired" | "Completed";

export type DeadlineCategory = "Course" | "Other";

export type Course = "General";

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
