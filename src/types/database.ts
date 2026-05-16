export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      body_metrics: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          id: string
          trainer_id: string
          client_id: string
          last_message_at: string
          created_at: string
        }
        Insert: {
          id?: string
          trainer_id: string
          client_id: string
          last_message_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          trainer_id?: string
          client_id?: string
          last_message_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_workouts: {
        Row: {
          created_at: string
          creator_id: string
          description: string
          description_bg: string
          difficulty: string
          duration_minutes: number
          exercises: Json
          id: string
          is_public: boolean
          muscle_groups: string[]
          name: string
          name_bg: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string
          description_bg?: string
          difficulty?: string
          duration_minutes?: number
          exercises?: Json
          id?: string
          is_public?: boolean
          muscle_groups?: string[]
          name: string
          name_bg?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string
          description_bg?: string
          difficulty?: string
          duration_minutes?: number
          exercises?: Json
          id?: string
          is_public?: boolean
          muscle_groups?: string[]
          name?: string
          name_bg?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_workouts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_logs: {
        Row: {
          created_at: string
          exercise_id: string
          exercise_name: string
          id: string
          order_index: number
          workout_log_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          exercise_name: string
          id?: string
          order_index: number
          workout_log_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          exercise_name?: string
          id?: string
          order_index?: number
          workout_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_logs_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          content: string
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          content?: string
          read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          goal: string | null
          height: number | null
          id: string
          language: string
          name: string
          role: string
          trainer_code: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          goal?: string | null
          height?: number | null
          id: string
          language?: string
          name: string
          role?: string
          trainer_code?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          goal?: string | null
          height?: number | null
          id?: string
          language?: string
          name?: string
          role?: string
          trainer_code?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: []
      }
      set_logs: {
        Row: {
          completed: boolean
          created_at: string
          exercise_log_id: string
          id: string
          reps: number
          set_number: number
          weight: number
        }
        Insert: {
          completed?: boolean
          created_at?: string
          exercise_log_id: string
          id?: string
          reps?: number
          set_number: number
          weight?: number
        }
        Update: {
          completed?: boolean
          created_at?: string
          exercise_log_id?: string
          id?: string
          reps?: number
          set_number?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "set_logs_exercise_log_id_fkey"
            columns: ["exercise_log_id"]
            isOneToOne: false
            referencedRelation: "exercise_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_clients: {
        Row: {
          client_confirmed: boolean
          client_id: string
          connected_at: string
          id: string
          status: string
          trainer_id: string
        }
        Insert: {
          client_confirmed?: boolean
          client_id: string
          connected_at?: string
          id?: string
          status?: string
          trainer_id: string
        }
        Update: {
          client_confirmed?: boolean
          client_id?: string
          connected_at?: string
          id?: string
          status?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_clients_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_invites: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          trainer_id: string
          used: boolean
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          trainer_id: string
          used?: boolean
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          trainer_id?: string
          used?: boolean
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_invites_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_assignments: {
        Row: {
          id: string
          trainer_id: string
          client_id: string
          workout_id: string
          assigned_at: string
          due_date: string | null
          status: string
          completed_at: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          trainer_id: string
          client_id: string
          workout_id: string
          assigned_at?: string
          due_date?: string | null
          status?: string
          completed_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          trainer_id?: string
          client_id?: string
          workout_id?: string
          assigned_at?: string
          due_date?: string | null
          status?: string
          completed_at?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_assignments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_assignments_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "custom_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_goals: {
        Row: {
          id: string
          client_id: string
          goal_type: string
          title: string
          target_value: number | null
          current_value: number | null
          unit: string | null
          exercise_name: string | null
          deadline: string | null
          status: string
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          goal_type: string
          title: string
          target_value?: number | null
          current_value?: number | null
          unit?: string | null
          exercise_name?: string | null
          deadline?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          goal_type?: string
          title?: string
          target_value?: number | null
          current_value?: number | null
          unit?: string | null
          exercise_name?: string | null
          deadline?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_suggestions: {
        Row: {
          id: string
          trainer_id: string
          client_id: string
          target_goal_id: string | null
          suggestion_type: string
          goal_type: string
          title: string
          target_value: number | null
          unit: string | null
          exercise_name: string | null
          deadline: string | null
          message: string | null
          status: string
          client_response_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          trainer_id: string
          client_id: string
          target_goal_id?: string | null
          suggestion_type: string
          goal_type: string
          title: string
          target_value?: number | null
          unit?: string | null
          exercise_name?: string | null
          deadline?: string | null
          message?: string | null
          status?: string
          client_response_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          trainer_id?: string
          client_id?: string
          target_goal_id?: string | null
          suggestion_type?: string
          goal_type?: string
          title?: string
          target_value?: number | null
          unit?: string | null
          exercise_name?: string | null
          deadline?: string | null
          message?: string | null
          status?: string
          client_response_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_suggestions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_suggestions_target_goal_id_fkey"
            columns: ["target_goal_id"]
            isOneToOne: false
            referencedRelation: "client_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_feedback: {
        Row: {
          id: string
          workout_log_id: string
          trainer_id: string
          message: string
          created_at: string
        }
        Insert: {
          id?: string
          workout_log_id: string
          trainer_id: string
          message: string
          created_at?: string
        }
        Update: {
          id?: string
          workout_log_id?: string
          trainer_id?: string
          message?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_feedback_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_feedback_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          completed: boolean
          created_at: string
          date: string
          duration_seconds: number | null
          end_time: string | null
          id: string
          notes: string | null
          start_time: string
          user_id: string
          workout_id: string
          workout_name: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          date?: string
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          notes?: string | null
          start_time?: string
          user_id: string
          workout_id: string
          workout_name: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          date?: string
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          notes?: string | null
          start_time?: string
          user_id?: string
          workout_id?: string
          workout_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_connection: { Args: { p_connection_id: string }; Returns: Json }
      confirm_connection: { Args: { p_connection_id: string }; Returns: Json }
      get_or_create_conversation: { Args: { p_other_user_id: string }; Returns: Json }
      get_conversations: { Args: Record<string, never>; Returns: Json }
      redeem_invite_code: { Args: { p_code: string }; Returns: Json }
      reject_connection: { Args: { p_connection_id: string }; Returns: Json }
      save_workout: {
        Args: {
          p_duration_seconds: number
          p_exercises?: Json
          p_notes?: string
          p_user_id: string
          p_workout_id: string
          p_workout_name: string
        }
        Returns: string
      }
      send_message: { Args: { p_conversation_id: string; p_content: string }; Returns: Json }
      mark_messages_read: { Args: { p_conversation_id: string }; Returns: undefined }
      get_recent_client_activity: {
        Args: { p_trainer_id: string; p_limit?: number }
        Returns: {
          id: string
          user_id: string
          workout_name: string
          date: string
          duration_seconds: number
          client_name: string | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

