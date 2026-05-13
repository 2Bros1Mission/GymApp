# 💪 GymApp

A fitness mobile app built for the Bulgarian market. Track workouts, monitor progress, and connect with trainers — all in one place.

Built with **React Native + Expo** and powered by **Supabase**.

---

## Features

- 🔐 **Auth** — Sign up, log in, log out with email/password
- 🏋️ **Pre-made Workouts** — Push Day, Pull Day, Leg Day, Full Body, Upper Body
- ▶️ **Active Workout** — Log sets, reps, and weights in real time
- 📊 **Progress Tracking** — Workout streak, weekly count, total sessions
- 👤 **Profile** — Role badge (Client / Trainer), fitness goals, body metrics
- 🌍 **Bulgarian-first** — Full BG/EN localization system
- 🌑 **Dark theme** — Gym-culture UI

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo SDK 54 |
| Routing | Expo Router (file-based) |
| Backend | Supabase (Auth + PostgreSQL) |
| Storage | expo-secure-store |
| Language | TypeScript |

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/gosheto050/GymApp.git
cd GymApp
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example file and fill in your Supabase credentials:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Set up the database

Run the SQL schema in your Supabase project:

```
supabase/schema.sql
```

This creates the `profiles`, `workout_logs`, `exercise_logs`, `set_logs`, and `body_metrics` tables with RLS policies and a trigger that auto-creates a profile on signup.

### 5. Start the app

```bash
npx expo start --web       # Web browser
npx expo start             # Expo Go on phone
```

---

## Project Structure

```
GymApp/
├── app/
│   ├── (auth)/            # Welcome, Login, Signup screens
│   ├── (tabs)/            # Home, Workouts, Progress, Profile tabs
│   ├── workout/[id].tsx   # Workout detail screen
│   ├── active-workout/    # Active workout logger
│   └── _layout.tsx        # Root layout + auth routing
├── src/
│   ├── constants/         # Theme, i18n translations
│   ├── contexts/          # AuthContext (session + profile)
│   ├── data/              # Pre-made workout data
│   ├── lib/               # Supabase client, workout service
│   └── types/             # TypeScript interfaces
├── supabase/
│   └── schema.sql         # Full database schema
└── .env.example           # Environment variable template
```

---

## Roadmap

- [ ] Trainer–client connections
- [ ] Workout plan assignment by trainer
- [ ] In-app chat
- [ ] Body weight / progress photos
- [ ] Subscription & payments
- [ ] Push notifications

---

## License

Private project — all rights reserved.
