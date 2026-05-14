import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { createCustomWorkout, updateCustomWorkout, getCustomWorkout } from '../lib/trainerService';
import type { Exercise, MuscleGroup, DifficultyLevel } from '../types';

export interface ExerciseForm {
  id: string;
  name: string;
  nameBg: string;
  muscleGroup: MuscleGroup;
  sets: string;
  reps: string;
  restSeconds: string;
}

function newExercise(): ExerciseForm {
  return {
    id: `ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    nameBg: '',
    muscleGroup: 'chest',
    sets: '3',
    reps: '10',
    restSeconds: '60',
  };
}

export function useWorkoutBuilderForm(editId?: string) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [nameBg, setNameBg] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionBg, setDescriptionBg] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('intermediate');
  const [duration, setDuration] = useState('30');
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [exercises, setExercises] = useState<ExerciseForm[]>([newExercise()]);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    if (!editId) return;
    setLoadingExisting(true);
    getCustomWorkout(editId).then((w) => {
      if (w) {
        setName(w.name);
        setNameBg(w.nameBg);
        setDescription(w.description);
        setDescriptionBg(w.descriptionBg);
        setDifficulty(w.difficulty);
        setDuration(String(w.durationMinutes));
        setMuscleGroups(w.muscleGroups);
        setIsPublic(w.isPublic);
        setExercises(w.exercises.map((e) => ({
          id: e.id,
          name: e.name,
          nameBg: e.nameBg,
          muscleGroup: e.muscleGroup,
          sets: String(e.sets),
          reps: e.reps,
          restSeconds: String(e.restSeconds),
        })));
      }
      setLoadingExisting(false);
    });
  }, [editId]);

  const toggleMuscleGroup = useCallback((mg: MuscleGroup) => {
    setMuscleGroups((prev) =>
      prev.includes(mg) ? prev.filter((g) => g !== mg) : [...prev, mg]
    );
  }, []);

  const updateExercise = useCallback((index: number, field: keyof ExerciseForm, value: string) => {
    setExercises((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const updateExerciseMuscle = useCallback((index: number, mg: MuscleGroup) => {
    setExercises((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], muscleGroup: mg };
      return updated;
    });
  }, []);

  const removeExercise = useCallback((index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveExercise = useCallback((index: number, direction: -1 | 1) => {
    setExercises((prev) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const updated = [...prev];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated;
    });
  }, []);

  const addExercise = useCallback(() => {
    setExercises((prev) => [...prev, newExercise()]);
  }, []);

  const isValid = name.trim() !== '' && exercises.length > 0 && exercises.every((e) => e.name.trim() !== '');

  const handleSave = useCallback(async () => {
    if (!user || !isValid) return;
    setSaving(true);
    setError('');
    setSuccess('');

    const exerciseData: Exercise[] = exercises.map((e) => ({
      id: e.id,
      name: e.name.trim(),
      nameBg: e.nameBg.trim(),
      muscleGroup: e.muscleGroup,
      sets: parseInt(e.sets, 10) || 3,
      reps: e.reps || '10',
      restSeconds: parseInt(e.restSeconds, 10) || 60,
    }));

    const workoutData = {
      name: name.trim(),
      nameBg: nameBg.trim(),
      description: description.trim(),
      descriptionBg: descriptionBg.trim(),
      difficulty,
      durationMinutes: parseInt(duration, 10) || 30,
      muscleGroups,
      exercises: exerciseData,
      isPublic,
    };

    let result;
    if (editId) {
      result = await updateCustomWorkout(editId, workoutData);
    } else {
      result = await createCustomWorkout({ ...workoutData, creatorId: user.id });
    }

    setSaving(false);

    if (result.error) {
      setError(t('builder.saveError'));
    } else {
      setSuccess(t('builder.saved'));
      setTimeout(() => router.back(), 800);
    }
  }, [user, isValid, exercises, name, nameBg, description, descriptionBg, difficulty, duration, muscleGroups, isPublic, editId, router, t]);

  return {
    name, setName,
    nameBg, setNameBg,
    description, setDescription,
    descriptionBg, setDescriptionBg,
    difficulty, setDifficulty,
    duration, setDuration,
    muscleGroups, toggleMuscleGroup,
    exercises, addExercise, updateExercise, updateExerciseMuscle, removeExercise, moveExercise,
    isPublic, setIsPublic,
    saving, success, error, loadingExisting, isValid,
    handleSave,
  };
}
