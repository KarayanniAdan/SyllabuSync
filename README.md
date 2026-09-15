# SyllabuSync

SyllabuSync is a web app that automatically extracts homework assignments and deadlines from university emails and displays them in one place.

Live site: https://syllabusync-phi.vercel.app/

## How it works

Course emails are forwarded into an automated processing pipeline:

Outlook
↓
Power Automate
↓
Gmail
↓
Webhook
↓
AI extraction
↓
Supabase
↓
SyllabuSync dashboard

Each email is analyzed to determine whether it contains an actual homework assignment.

If it does, SyllabuSync extracts the relevant information, including the course, assignment details, deadline, and a short summary.

The result is then stored in Supabase and shown on the dashboard.

## Features

- Automatic homework extraction from course emails
- AI-based deadline extraction and summarization
- Course matching
- Duplicate email detection
- Filters out unrelated announcements and events
- Assignments sorted by upcoming deadline
- Mark assignments as completed
- Deadline status indicators
- Supports multiple courses

## Tech Stack

### Frontend

- TypeScript
- React
- TanStack Start
- Vite

### Backend

- TypeScript
- Nitro
- Bun

### Database

- Supabase
- PostgreSQL

### AI / Automation

- OpenAI API
- Microsoft Power Automate
- Gmail
- Webhooks

### Deployment

- Vercel

## Why I built it

During the semester, homework information is spread across different course emails and mailing lists.

I wanted a system where I would not have to manually search through emails or copy deadlines into another app.

The idea was simple:

> A homework email arrives → the assignment appears automatically on my dashboard.

## Current status

The full pipeline is working end-to-end and the app is deployed.

The current version focuses specifically on homework assignments rather than general course announcements or events.
