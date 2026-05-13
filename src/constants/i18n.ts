type Translations = Record<string, Record<string, string>>;

export const translations: Translations = {
  bg: {
    'tab.home': 'Начало',
    'tab.workouts': 'Тренировки',
    'tab.progress': 'Прогрес',
    'tab.profile': 'Профил',

    'home.greeting': 'Здравей',
    'home.todayWorkout': 'Тренировка за днес',
    'home.noWorkout': 'Няма планирана тренировка',
    'home.quickStats': 'Бързи статистики',
    'home.streak': 'Серия',
    'home.thisWeek': 'Тази седмица',
    'home.totalWorkouts': 'Общо тренировки',
    'home.startWorkout': 'Започни тренировка',
    'home.days': 'дни',
    'home.goals': 'Цели',

    'workouts.title': 'Тренировки',
    'workouts.browse': 'Разгледай тренировки',
    'workouts.myProgram': 'Моята програма',
    'workouts.filter': 'Филтрирай',
    'workouts.all': 'Всички',
    'workouts.beginner': 'Начинаещ',
    'workouts.intermediate': 'Среден',
    'workouts.advanced': 'Напреднал',
    'workouts.minutes': 'мин',
    'workouts.exercises': 'упражнения',
    'workouts.start': 'Започни',

    'exercise.sets': 'серии',
    'exercise.reps': 'повторения',
    'exercise.weight': 'кг',
    'exercise.rest': 'Почивка',
    'exercise.done': 'Готово',
    'exercise.skip': 'Пропусни',
    'exercise.finish': 'Завърши тренировка',
    'exercise.completed': 'Тренировката завършена!',
    'exercise.great': 'Страхотна работа!',

    'progress.title': 'Прогрес',
    'progress.weight': 'Тегло',
    'progress.workoutsCompleted': 'Завършени тренировки',
    'progress.history': 'История',
    'progress.noData': 'Все още няма данни',

    'profile.title': 'Профил',
    'profile.settings': 'Настройки',
    'profile.language': 'Език',
    'profile.subscription': 'Абонамент',
    'profile.free': 'Безплатен',
    'profile.premium': 'Премиум',
    'profile.logout': 'Излез',
    'profile.editProfile': 'Редактирай профил',

    'auth.welcome': 'Добре дошъл',
    'auth.login': 'Влез',
    'auth.signup': 'Регистрирай се',
    'auth.email': 'Имейл',
    'auth.password': 'Парола',
    'auth.name': 'Име',
    'auth.noAccount': 'Нямаш акаунт?',
    'auth.hasAccount': 'Вече имаш акаунт?',
    'auth.asClient': 'Като клиент',
    'auth.asTrainer': 'Като треньор',

    'muscle.chest': 'Гърди',
    'muscle.back': 'Гръб',
    'muscle.shoulders': 'Рамене',
    'muscle.biceps': 'Бицепс',
    'muscle.triceps': 'Трицепс',
    'muscle.legs': 'Крака',
    'muscle.core': 'Корем',
    'muscle.full_body': 'Цяло тяло',

    'difficulty.beginner': 'Начинаещ',
    'difficulty.intermediate': 'Среден',
    'difficulty.advanced': 'Напреднал',
  },
  en: {
    'tab.home': 'Home',
    'tab.workouts': 'Workouts',
    'tab.progress': 'Progress',
    'tab.profile': 'Profile',

    'home.greeting': 'Hello',
    'home.todayWorkout': "Today's Workout",
    'home.noWorkout': 'No workout planned',
    'home.quickStats': 'Quick Stats',
    'home.streak': 'Streak',
    'home.thisWeek': 'This Week',
    'home.totalWorkouts': 'Total Workouts',
    'home.startWorkout': 'Start Workout',
    'home.days': 'days',
    'home.goals': 'Goals',

    'workouts.title': 'Workouts',
    'workouts.browse': 'Browse Workouts',
    'workouts.myProgram': 'My Program',
    'workouts.filter': 'Filter',
    'workouts.all': 'All',
    'workouts.beginner': 'Beginner',
    'workouts.intermediate': 'Intermediate',
    'workouts.advanced': 'Advanced',
    'workouts.minutes': 'min',
    'workouts.exercises': 'exercises',
    'workouts.start': 'Start',

    'exercise.sets': 'sets',
    'exercise.reps': 'reps',
    'exercise.weight': 'kg',
    'exercise.rest': 'Rest',
    'exercise.done': 'Done',
    'exercise.skip': 'Skip',
    'exercise.finish': 'Finish Workout',
    'exercise.completed': 'Workout Complete!',
    'exercise.great': 'Great work!',

    'progress.title': 'Progress',
    'progress.weight': 'Weight',
    'progress.workoutsCompleted': 'Workouts Completed',
    'progress.history': 'History',
    'progress.noData': 'No data yet',

    'profile.title': 'Profile',
    'profile.settings': 'Settings',
    'profile.language': 'Language',
    'profile.subscription': 'Subscription',
    'profile.free': 'Free',
    'profile.premium': 'Premium',
    'profile.logout': 'Log Out',
    'profile.editProfile': 'Edit Profile',

    'auth.welcome': 'Welcome',
    'auth.login': 'Log In',
    'auth.signup': 'Sign Up',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.name': 'Name',
    'auth.noAccount': "Don't have an account?",
    'auth.hasAccount': 'Already have an account?',
    'auth.asClient': 'As Client',
    'auth.asTrainer': 'As Trainer',

    'muscle.chest': 'Chest',
    'muscle.back': 'Back',
    'muscle.shoulders': 'Shoulders',
    'muscle.biceps': 'Biceps',
    'muscle.triceps': 'Triceps',
    'muscle.legs': 'Legs',
    'muscle.core': 'Core',
    'muscle.full_body': 'Full Body',

    'difficulty.beginner': 'Beginner',
    'difficulty.intermediate': 'Intermediate',
    'difficulty.advanced': 'Advanced',
  },
};

let currentLanguage: 'bg' | 'en' = 'bg';

export function setLanguage(lang: 'bg' | 'en') {
  currentLanguage = lang;
}

export function getLanguage(): 'bg' | 'en' {
  return currentLanguage;
}

export function t(key: string): string {
  return translations[currentLanguage]?.[key] ?? key;
}
