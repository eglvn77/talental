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
  hiring: {
    Tables: {
      api_usage_log: {
        Row: {
          api_response_status: number | null
          api_response_time_ms: number | null
          cache_hit: boolean | null
          cost_usd_estimated: number | null
          created_at: string | null
          credits_used: number
          id: string
          operation_type: string
          resource_external_id: string | null
          resource_internal_id: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          api_response_status?: number | null
          api_response_time_ms?: number | null
          cache_hit?: boolean | null
          cost_usd_estimated?: number | null
          created_at?: string | null
          credits_used?: number
          id?: string
          operation_type: string
          resource_external_id?: string | null
          resource_internal_id?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          api_response_status?: number | null
          api_response_time_ms?: number | null
          cache_hit?: boolean | null
          cost_usd_estimated?: number | null
          created_at?: string | null
          credits_used?: number
          id?: string
          operation_type?: string
          resource_external_id?: string | null
          resource_internal_id?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      application_events: {
        Row: {
          actor: string | null
          application_id: string
          created_at: string
          event_type: string
          id: number
          payload: Json | null
          workspace_id: string
        }
        Insert: {
          actor?: string | null
          application_id: string
          created_at?: string
          event_type: string
          id?: number
          payload?: Json | null
          workspace_id: string
        }
        Update: {
          actor?: string | null
          application_id?: string
          created_at?: string
          event_type?: string
          id?: number
          payload?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          ai_context_updated_at: string | null
          ai_next_steps: Json | null
          ai_status_line: string | null
          applied_at: string
          assigned_to: string | null
          candidate_id: string
          category: Database["hiring"]["Enums"]["pipeline_category"] | null
          created_at: string
          id: string
          interview_score: number | null
          job_id: string
          recruiter_decision: string | null
          recruiter_notes: string | null
          rejection_reason: string | null
          rejection_reason_id: string | null
          screening_score: number | null
          source: Database["hiring"]["Enums"]["candidate_source"]
          source_meta: Json | null
          stage_id: string | null
          status_changed_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_context_updated_at?: string | null
          ai_next_steps?: Json | null
          ai_status_line?: string | null
          applied_at?: string
          assigned_to?: string | null
          candidate_id: string
          category?: Database["hiring"]["Enums"]["pipeline_category"] | null
          created_at?: string
          id?: string
          interview_score?: number | null
          job_id: string
          recruiter_decision?: string | null
          recruiter_notes?: string | null
          rejection_reason?: string | null
          rejection_reason_id?: string | null
          screening_score?: number | null
          source: Database["hiring"]["Enums"]["candidate_source"]
          source_meta?: Json | null
          stage_id?: string | null
          status_changed_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_context_updated_at?: string | null
          ai_next_steps?: Json | null
          ai_status_line?: string | null
          applied_at?: string
          assigned_to?: string | null
          candidate_id?: string
          category?: Database["hiring"]["Enums"]["pipeline_category"] | null
          created_at?: string
          id?: string
          interview_score?: number | null
          job_id?: string
          recruiter_decision?: string | null
          recruiter_notes?: string | null
          rejection_reason?: string | null
          rejection_reason_id?: string | null
          screening_score?: number | null
          source?: Database["hiring"]["Enums"]["candidate_source"]
          source_meta?: Json | null
          stage_id?: string | null
          status_changed_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_rejection_reason_id_fkey"
            columns: ["rejection_reason_id"]
            isOneToOne: false
            referencedRelation: "rejection_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_role_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_education: {
        Row: {
          candidate_id: string
          created_at: string | null
          degree: string | null
          end_date: string | null
          enriched_at: string | null
          field_of_study: string | null
          id: string
          position_idx: number | null
          school: string
          school_logo_url: string | null
          start_date: string | null
          workspace_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string | null
          degree?: string | null
          end_date?: string | null
          enriched_at?: string | null
          field_of_study?: string | null
          id?: string
          position_idx?: number | null
          school: string
          school_logo_url?: string | null
          start_date?: string | null
          workspace_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string | null
          degree?: string | null
          end_date?: string | null
          enriched_at?: string | null
          field_of_study?: string | null
          id?: string
          position_idx?: number | null
          school?: string
          school_logo_url?: string | null
          start_date?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_education_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_education_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_experience: {
        Row: {
          candidate_id: string
          company_id: string | null
          company_name: string
          created_at: string | null
          description: string | null
          duration_months: number | null
          end_date: string | null
          enriched_at: string | null
          id: string
          is_current: boolean | null
          location: string | null
          position: string | null
          position_idx: number | null
          start_date: string | null
          workspace_id: string
        }
        Insert: {
          candidate_id: string
          company_id?: string | null
          company_name: string
          created_at?: string | null
          description?: string | null
          duration_months?: number | null
          end_date?: string | null
          enriched_at?: string | null
          id?: string
          is_current?: boolean | null
          location?: string | null
          position?: string | null
          position_idx?: number | null
          start_date?: string | null
          workspace_id: string
        }
        Update: {
          candidate_id?: string
          company_id?: string | null
          company_name?: string
          created_at?: string | null
          description?: string | null
          duration_months?: number | null
          end_date?: string | null
          enriched_at?: string | null
          id?: string
          is_current?: boolean | null
          location?: string | null
          position?: string | null
          position_idx?: number | null
          start_date?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_experience_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_experience_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_experience_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_skills: {
        Row: {
          candidate_id: string
          skill: string
          workspace_id: string
        }
        Insert: {
          candidate_id: string
          skill: string
          workspace_id: string
        }
        Update: {
          candidate_id?: string
          skill?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_skills_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_skills_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          created_by_team_member_id: string | null
          current_company_name: string | null
          current_position: string | null
          data_version: number | null
          default_source: Database["hiring"]["Enums"]["candidate_source"] | null
          email: string | null
          embedding: string | null
          enriched_at: string | null
          enrichment_source: string | null
          enrichment_status: string | null
          first_name: string | null
          full_name: string
          headline: string | null
          id: string
          last_name: string | null
          linkedin_public_id: string | null
          linkedin_url: string | null
          location: string | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          needs_embedding: boolean | null
          next_refresh_at: string | null
          owner_id: string | null
          parsed_profile: Json | null
          phone: string | null
          profile_picture_url: string | null
          resume_text: string | null
          resume_url: string | null
          summary: string | null
          updated_at: string
          workspace_id: string
          years_of_experience: number | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          created_by_team_member_id?: string | null
          current_company_name?: string | null
          current_position?: string | null
          data_version?: number | null
          default_source?:
            | Database["hiring"]["Enums"]["candidate_source"]
            | null
          email?: string | null
          embedding?: string | null
          enriched_at?: string | null
          enrichment_source?: string | null
          enrichment_status?: string | null
          first_name?: string | null
          full_name: string
          headline?: string | null
          id?: string
          last_name?: string | null
          linkedin_public_id?: string | null
          linkedin_url?: string | null
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          needs_embedding?: boolean | null
          next_refresh_at?: string | null
          owner_id?: string | null
          parsed_profile?: Json | null
          phone?: string | null
          profile_picture_url?: string | null
          resume_text?: string | null
          resume_url?: string | null
          summary?: string | null
          updated_at?: string
          workspace_id: string
          years_of_experience?: number | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          created_by_team_member_id?: string | null
          current_company_name?: string | null
          current_position?: string | null
          data_version?: number | null
          default_source?:
            | Database["hiring"]["Enums"]["candidate_source"]
            | null
          email?: string | null
          embedding?: string | null
          enriched_at?: string | null
          enrichment_source?: string | null
          enrichment_status?: string | null
          first_name?: string | null
          full_name?: string
          headline?: string | null
          id?: string
          last_name?: string | null
          linkedin_public_id?: string | null
          linkedin_url?: string | null
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          needs_embedding?: boolean | null
          next_refresh_at?: string | null
          owner_id?: string | null
          parsed_profile?: Json | null
          phone?: string | null
          profile_picture_url?: string | null
          resume_text?: string | null
          resume_url?: string | null
          summary?: string | null
          updated_at?: string
          workspace_id?: string
          years_of_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_created_by_team_member_id_fkey"
            columns: ["created_by_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          company_type: string | null
          created_at: string
          created_by: string | null
          description: string | null
          dfb2b_id: string | null
          domain: string | null
          embedding: string | null
          employee_count: number | null
          enriched_at: string | null
          enrichment_source: string | null
          enrichment_status: string | null
          founded_year: number | null
          funding_stage: string | null
          hq_city: string | null
          hq_country: string | null
          hq_location: string | null
          id: string
          industry: string | null
          linkedin_id: string | null
          linkedin_url: string | null
          logo_url: string | null
          name: string
          needs_embedding: boolean | null
          next_refresh_at: string | null
          owner_id: string | null
          size_range: string | null
          status: Database["hiring"]["Enums"]["company_status"]
          total_funding_usd: number | null
          updated_at: string
          website_url: string | null
          workspace_id: string
        }
        Insert: {
          company_type?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          dfb2b_id?: string | null
          domain?: string | null
          embedding?: string | null
          employee_count?: number | null
          enriched_at?: string | null
          enrichment_source?: string | null
          enrichment_status?: string | null
          founded_year?: number | null
          funding_stage?: string | null
          hq_city?: string | null
          hq_country?: string | null
          hq_location?: string | null
          id?: string
          industry?: string | null
          linkedin_id?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          name: string
          needs_embedding?: boolean | null
          next_refresh_at?: string | null
          owner_id?: string | null
          size_range?: string | null
          status?: Database["hiring"]["Enums"]["company_status"]
          total_funding_usd?: number | null
          updated_at?: string
          website_url?: string | null
          workspace_id: string
        }
        Update: {
          company_type?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          dfb2b_id?: string | null
          domain?: string | null
          embedding?: string | null
          employee_count?: number | null
          enriched_at?: string | null
          enrichment_source?: string | null
          enrichment_status?: string | null
          founded_year?: number | null
          funding_stage?: string | null
          hq_city?: string | null
          hq_country?: string | null
          hq_location?: string | null
          id?: string
          industry?: string | null
          linkedin_id?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          name?: string
          needs_embedding?: boolean | null
          next_refresh_at?: string | null
          owner_id?: string | null
          size_range?: string | null
          status?: Database["hiring"]["Enums"]["company_status"]
          total_funding_usd?: number | null
          updated_at?: string
          website_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_accounts: {
        Row: {
          account_metadata: Json
          created_at: string
          id: string
          last_status_update: string
          provider: string
          status: string
          unipile_account_id: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          account_metadata?: Json
          created_at?: string
          id?: string
          last_status_update?: string
          provider: string
          status?: string
          unipile_account_id?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          account_metadata?: Json
          created_at?: string
          id?: string
          last_status_update?: string
          provider?: string
          status?: string
          unipile_account_id?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          linkedin_url: string | null
          location: string | null
          notes_summary: string | null
          owner_id: string | null
          phone: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          linkedin_url?: string | null
          location?: string | null
          notes_summary?: string | null
          owner_id?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          linkedin_url?: string | null
          location?: string | null
          notes_summary?: string | null
          owner_id?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          application_id: string | null
          candidate_id: string | null
          channel: Database["hiring"]["Enums"]["message_channel"]
          contact_id: string | null
          created_at: string
          external_id: string | null
          id: string
          last_message_at: string | null
          subject: string | null
          unread_count: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          application_id?: string | null
          candidate_id?: string | null
          channel: Database["hiring"]["Enums"]["message_channel"]
          contact_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_message_at?: string | null
          subject?: string | null
          unread_count?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          application_id?: string | null
          candidate_id?: string | null
          channel?: Database["hiring"]["Enums"]["message_channel"]
          contact_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_message_at?: string | null
          subject?: string | null
          unread_count?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entity_type: Database["hiring"]["Enums"]["entity_type"]
          id: string
          is_required: boolean
          key: string
          kind: Database["hiring"]["Enums"]["custom_field_kind"]
          label: string
          options: Json | null
          position: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type: Database["hiring"]["Enums"]["entity_type"]
          id?: string
          is_required?: boolean
          key: string
          kind: Database["hiring"]["Enums"]["custom_field_kind"]
          label: string
          options?: Json | null
          position?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type?: Database["hiring"]["Enums"]["entity_type"]
          id?: string
          is_required?: boolean
          key?: string
          kind?: Database["hiring"]["Enums"]["custom_field_kind"]
          label?: string
          options?: Json | null
          position?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_definitions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_values: {
        Row: {
          created_at: string
          definition_id: string
          entity_id: string
          entity_type: Database["hiring"]["Enums"]["entity_type"]
          id: string
          updated_at: string
          updated_by: string | null
          value: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          definition_id: string
          entity_id: string
          entity_type: Database["hiring"]["Enums"]["entity_type"]
          id?: string
          updated_at?: string
          updated_by?: string | null
          value: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          definition_id?: string
          entity_id?: string
          entity_type?: Database["hiring"]["Enums"]["entity_type"]
          id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_values_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_values_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          closed_at: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expected_close_date: string | null
          id: string
          owner_id: string | null
          primary_contact_id: string | null
          stage: Database["hiring"]["Enums"]["deal_stage"]
          title: string
          updated_at: string
          value_amount: number | null
          value_currency: string | null
          workspace_id: string
        }
        Insert: {
          closed_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_close_date?: string | null
          id?: string
          owner_id?: string | null
          primary_contact_id?: string | null
          stage?: Database["hiring"]["Enums"]["deal_stage"]
          title: string
          updated_at?: string
          value_amount?: number | null
          value_currency?: string | null
          workspace_id: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_close_date?: string | null
          id?: string
          owner_id?: string | null
          primary_contact_id?: string | null
          stage?: Database["hiring"]["Enums"]["deal_stage"]
          title?: string
          updated_at?: string
          value_amount?: number | null
          value_currency?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_config: {
        Row: {
          auto_refresh: boolean | null
          data_type: string
          description: string | null
          ttl_days: number
        }
        Insert: {
          auto_refresh?: boolean | null
          data_type: string
          description?: string | null
          ttl_days: number
        }
        Update: {
          auto_refresh?: boolean | null
          data_type?: string
          description?: string | null
          ttl_days?: number
        }
        Relationships: []
      }
      entity_tags: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: Database["hiring"]["Enums"]["entity_type"]
          tag_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: Database["hiring"]["Enums"]["entity_type"]
          tag_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: Database["hiring"]["Enums"]["entity_type"]
          tag_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          ai_summary: string | null
          application_id: string
          cf_stream_playback_url: string | null
          cf_stream_video_id: string | null
          completed_at: string | null
          created_at: string
          elevenlabs_agent_id: string | null
          elevenlabs_conversation_id: string | null
          failure_reason: string | null
          id: string
          link_sent_at: string | null
          link_token: string | null
          recording_started_at: string | null
          rubric_breakdown: Json | null
          score: number | null
          started_at: string | null
          status: Database["hiring"]["Enums"]["interview_status"]
          transcript: Json | null
          workspace_id: string
        }
        Insert: {
          ai_summary?: string | null
          application_id: string
          cf_stream_playback_url?: string | null
          cf_stream_video_id?: string | null
          completed_at?: string | null
          created_at?: string
          elevenlabs_agent_id?: string | null
          elevenlabs_conversation_id?: string | null
          failure_reason?: string | null
          id?: string
          link_sent_at?: string | null
          link_token?: string | null
          recording_started_at?: string | null
          rubric_breakdown?: Json | null
          score?: number | null
          started_at?: string | null
          status?: Database["hiring"]["Enums"]["interview_status"]
          transcript?: Json | null
          workspace_id: string
        }
        Update: {
          ai_summary?: string | null
          application_id?: string
          cf_stream_playback_url?: string | null
          cf_stream_video_id?: string | null
          completed_at?: string | null
          created_at?: string
          elevenlabs_agent_id?: string | null
          elevenlabs_conversation_id?: string | null
          failure_reason?: string | null
          id?: string
          link_sent_at?: string | null
          link_token?: string | null
          recording_started_at?: string | null
          rubric_breakdown?: Json | null
          score?: number | null
          started_at?: string | null
          status?: Database["hiring"]["Enums"]["interview_status"]
          transcript?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      job_client_portal_settings: {
        Row: {
          allow_candidate_movement: boolean
          allow_feedback: boolean
          allow_view_analytics: boolean
          allow_view_notes: boolean
          enabled_at: string | null
          is_enabled: boolean
          job_id: string
          show_attachments: boolean
          show_email: boolean
          show_phone: boolean
          show_salary_expectations: boolean
          slug: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allow_candidate_movement?: boolean
          allow_feedback?: boolean
          allow_view_analytics?: boolean
          allow_view_notes?: boolean
          enabled_at?: string | null
          is_enabled?: boolean
          job_id: string
          show_attachments?: boolean
          show_email?: boolean
          show_phone?: boolean
          show_salary_expectations?: boolean
          slug?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allow_candidate_movement?: boolean
          allow_feedback?: boolean
          allow_view_analytics?: boolean
          allow_view_notes?: boolean
          enabled_at?: string | null
          is_enabled?: boolean
          job_id?: string
          show_attachments?: boolean
          show_email?: boolean
          show_phone?: boolean
          show_salary_expectations?: boolean
          slug?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_client_portal_settings_role_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_client_portal_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      job_owners: {
        Row: {
          created_at: string
          is_primary: boolean
          job_id: string
          team_member_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          job_id: string
          team_member_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          job_id?: string
          team_member_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_owners_role_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_owners_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_owners_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          ai_scoring_criteria: string | null
          ai_scoring_enabled: boolean
          apply_email_alias: string | null
          assessment_content: string | null
          assessment_link: string | null
          billing_format: string | null
          closed_at: string | null
          company_blurb: string | null
          company_id: string | null
          compensation_detail: string | null
          contract_type: string | null
          created_at: string
          created_by: string | null
          deposit_pct: number | null
          engagement_kind: Database["hiring"]["Enums"]["engagement_kind"] | null
          fee_currency: string | null
          fee_model: string | null
          fee_months: number | null
          fee_pct: number | null
          full_description: string | null
          hiring_manager_name: string | null
          hiring_process: Json | null
          id: string
          intake_form_response: Json | null
          internal_notes: string | null
          interview_questions: Json | null
          interview_script: Json | null
          language_requirements: string | null
          lead_company_id: string | null
          lead_contact_id: string | null
          lead_split_pct: number | null
          linkedin_post: string | null
          location: string | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          monthly_retainer: number | null
          open_date: string | null
          overview: Json | null
          owner_id: string | null
          paid_at: string | null
          placement_revenue_estimated: number | null
          public_description: string | null
          published_at: string | null
          recruiter_split_pct: number | null
          recruiter_team_member_id: string | null
          remote_policy: string | null
          requirements: Json | null
          retainer_pct: number | null
          role_type: Database["hiring"]["Enums"]["role_type"] | null
          rubric: Json | null
          salary_currency: string | null
          salary_frequency: string
          salary_max: number | null
          salary_min: number | null
          salary_type: string
          screening_questions: Json | null
          sourcer_contact_id: string | null
          sourcing: Json | null
          status: Database["hiring"]["Enums"]["role_status"]
          target_start_date: string | null
          title: string
          updated_at: string
          work_modality: string | null
          working_hours: string | null
          workspace_id: string
        }
        Insert: {
          ai_scoring_criteria?: string | null
          ai_scoring_enabled?: boolean
          apply_email_alias?: string | null
          assessment_content?: string | null
          assessment_link?: string | null
          billing_format?: string | null
          closed_at?: string | null
          company_blurb?: string | null
          company_id?: string | null
          compensation_detail?: string | null
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          deposit_pct?: number | null
          engagement_kind?:
            | Database["hiring"]["Enums"]["engagement_kind"]
            | null
          fee_currency?: string | null
          fee_model?: string | null
          fee_months?: number | null
          fee_pct?: number | null
          full_description?: string | null
          hiring_manager_name?: string | null
          hiring_process?: Json | null
          id?: string
          intake_form_response?: Json | null
          internal_notes?: string | null
          interview_questions?: Json | null
          interview_script?: Json | null
          language_requirements?: string | null
          lead_company_id?: string | null
          lead_contact_id?: string | null
          lead_split_pct?: number | null
          linkedin_post?: string | null
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          monthly_retainer?: number | null
          open_date?: string | null
          overview?: Json | null
          owner_id?: string | null
          paid_at?: string | null
          placement_revenue_estimated?: number | null
          public_description?: string | null
          published_at?: string | null
          recruiter_split_pct?: number | null
          recruiter_team_member_id?: string | null
          remote_policy?: string | null
          requirements?: Json | null
          retainer_pct?: number | null
          role_type?: Database["hiring"]["Enums"]["role_type"] | null
          rubric?: Json | null
          salary_currency?: string | null
          salary_frequency?: string
          salary_max?: number | null
          salary_min?: number | null
          salary_type?: string
          screening_questions?: Json | null
          sourcer_contact_id?: string | null
          sourcing?: Json | null
          status?: Database["hiring"]["Enums"]["role_status"]
          target_start_date?: string | null
          title: string
          updated_at?: string
          work_modality?: string | null
          working_hours?: string | null
          workspace_id: string
        }
        Update: {
          ai_scoring_criteria?: string | null
          ai_scoring_enabled?: boolean
          apply_email_alias?: string | null
          assessment_content?: string | null
          assessment_link?: string | null
          billing_format?: string | null
          closed_at?: string | null
          company_blurb?: string | null
          company_id?: string | null
          compensation_detail?: string | null
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          deposit_pct?: number | null
          engagement_kind?:
            | Database["hiring"]["Enums"]["engagement_kind"]
            | null
          fee_currency?: string | null
          fee_model?: string | null
          fee_months?: number | null
          fee_pct?: number | null
          full_description?: string | null
          hiring_manager_name?: string | null
          hiring_process?: Json | null
          id?: string
          intake_form_response?: Json | null
          internal_notes?: string | null
          interview_questions?: Json | null
          interview_script?: Json | null
          language_requirements?: string | null
          lead_company_id?: string | null
          lead_contact_id?: string | null
          lead_split_pct?: number | null
          linkedin_post?: string | null
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          monthly_retainer?: number | null
          open_date?: string | null
          overview?: Json | null
          owner_id?: string | null
          paid_at?: string | null
          placement_revenue_estimated?: number | null
          public_description?: string | null
          published_at?: string | null
          recruiter_split_pct?: number | null
          recruiter_team_member_id?: string | null
          remote_policy?: string | null
          requirements?: Json | null
          retainer_pct?: number | null
          role_type?: Database["hiring"]["Enums"]["role_type"] | null
          rubric?: Json | null
          salary_currency?: string | null
          salary_frequency?: string
          salary_max?: number | null
          salary_min?: number | null
          salary_type?: string
          screening_questions?: Json | null
          sourcer_contact_id?: string | null
          sourcing?: Json | null
          status?: Database["hiring"]["Enums"]["role_status"]
          target_start_date?: string | null
          title?: string
          updated_at?: string
          work_modality?: string | null
          working_hours?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_lead_company_id_fkey"
            columns: ["lead_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_lead_contact_id_fkey"
            columns: ["lead_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_recruiter_team_member_id_fkey"
            columns: ["recruiter_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_sourcer_contact_id_fkey"
            columns: ["sourcer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kickoff_runs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          id: string
          job_id: string
          materials: Json
          model: string
          output: Json | null
          ran_at: string
          ran_by: string | null
          run_kind: string
          setup_answers: Json
          status: string
          workspace_id: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_id: string
          materials: Json
          model: string
          output?: Json | null
          ran_at?: string
          ran_by?: string | null
          run_kind: string
          setup_answers: Json
          status: string
          workspace_id: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_id?: string
          materials?: Json
          model?: string
          output?: Json | null
          ran_at?: string
          ran_by?: string | null
          run_kind?: string
          setup_answers?: Json
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kickoff_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kickoff_runs_ran_by_fkey"
            columns: ["ran_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kickoff_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          body_html: string | null
          channel: Database["hiring"]["Enums"]["message_channel"]
          conversation_id: string
          created_at: string
          direction: Database["hiring"]["Enums"]["message_direction"]
          enrollment_id: string | null
          external_id: string | null
          from_address: string | null
          id: string
          raw: Json | null
          sender_id: string | null
          sent_at: string
          step_id: string | null
          subject: string | null
          to_address: string | null
          workspace_id: string
        }
        Insert: {
          body?: string | null
          body_html?: string | null
          channel: Database["hiring"]["Enums"]["message_channel"]
          conversation_id: string
          created_at?: string
          direction: Database["hiring"]["Enums"]["message_direction"]
          enrollment_id?: string | null
          external_id?: string | null
          from_address?: string | null
          id?: string
          raw?: Json | null
          sender_id?: string | null
          sent_at: string
          step_id?: string | null
          subject?: string | null
          to_address?: string | null
          workspace_id: string
        }
        Update: {
          body?: string | null
          body_html?: string | null
          channel?: Database["hiring"]["Enums"]["message_channel"]
          conversation_id?: string
          created_at?: string
          direction?: Database["hiring"]["Enums"]["message_direction"]
          enrollment_id?: string | null
          external_id?: string | null
          from_address?: string | null
          id?: string
          raw?: Json | null
          sender_id?: string | null
          sent_at?: string
          step_id?: string | null
          subject?: string | null
          to_address?: string | null
          workspace_id?: string
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
            foreignKeyName: "messages_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "sequence_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "sequence_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          entity_id: string
          entity_type: Database["hiring"]["Enums"]["entity_type"]
          id: string
          is_pinned: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          entity_id: string
          entity_type: Database["hiring"]["Enums"]["entity_type"]
          id?: string
          is_pinned?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["hiring"]["Enums"]["entity_type"]
          id?: string
          is_pinned?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          application_id: string | null
          created_at: string
          currency: string
          id: string
          job_id: string | null
          kind: Database["hiring"]["Enums"]["payment_kind"]
          paid_at: string | null
          raw_event: Json | null
          status: Database["hiring"]["Enums"]["payment_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          workspace_id: string
        }
        Insert: {
          amount_cents: number
          application_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          job_id?: string | null
          kind: Database["hiring"]["Enums"]["payment_kind"]
          paid_at?: string | null
          raw_event?: Json | null
          status?: Database["hiring"]["Enums"]["payment_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          application_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          job_id?: string | null
          kind?: Database["hiring"]["Enums"]["payment_kind"]
          paid_at?: string | null
          raw_event?: Json | null
          status?: Database["hiring"]["Enums"]["payment_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_role_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          category: Database["hiring"]["Enums"]["pipeline_category"]
          client_portal_visible: boolean
          color: string | null
          created_at: string
          id: string
          is_terminal: boolean
          job_id: string
          name: string
          on_enter_action: Json | null
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category: Database["hiring"]["Enums"]["pipeline_category"]
          client_portal_visible?: boolean
          color?: string | null
          created_at?: string
          id?: string
          is_terminal?: boolean
          job_id: string
          name: string
          on_enter_action?: Json | null
          position: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category?: Database["hiring"]["Enums"]["pipeline_category"]
          client_portal_visible?: boolean
          color?: string | null
          created_at?: string
          id?: string
          is_terminal?: boolean
          job_id?: string
          name?: string
          on_enter_action?: Json | null
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_role_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          body: string
          created_at: string
          id: string
          key: string
          label: string
          model: string
          model_params: Json | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          key: string
          label: string
          model?: string
          model_params?: Json | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          key?: string
          label?: string
          model?: string
          model_params?: Json | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rejection_reasons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          position: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          position?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          position?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rejection_reasons_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      screenings: {
        Row: {
          application_id: string
          completed_at: string | null
          created_at: string
          id: string
          kind: Database["hiring"]["Enums"]["screening_kind"]
          link_sent_at: string | null
          link_token: string | null
          passed: boolean | null
          raw_response: Json | null
          score: number | null
          scoring_rationale: string | null
          started_at: string | null
          transcript: Json | null
          workspace_id: string
        }
        Insert: {
          application_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          kind: Database["hiring"]["Enums"]["screening_kind"]
          link_sent_at?: string | null
          link_token?: string | null
          passed?: boolean | null
          raw_response?: Json | null
          score?: number | null
          scoring_rationale?: string | null
          started_at?: string | null
          transcript?: Json | null
          workspace_id: string
        }
        Update: {
          application_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          kind?: Database["hiring"]["Enums"]["screening_kind"]
          link_sent_at?: string | null
          link_token?: string | null
          passed?: boolean | null
          raw_response?: Json | null
          score?: number | null
          scoring_rationale?: string | null
          started_at?: string | null
          transcript?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screenings_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      search_cache: {
        Row: {
          created_at: string | null
          credits_used: number | null
          expires_at: string | null
          id: string
          query_embedding: string | null
          query_filters: Json | null
          query_normalized: string
          query_text: string
          result_candidate_ids: string[] | null
          result_company_ids: string[] | null
          total_results: number | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          credits_used?: number | null
          expires_at?: string | null
          id?: string
          query_embedding?: string | null
          query_filters?: Json | null
          query_normalized: string
          query_text: string
          result_candidate_ids?: string[] | null
          result_company_ids?: string[] | null
          total_results?: number | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          credits_used?: number | null
          expires_at?: string | null
          id?: string
          query_embedding?: string | null
          query_filters?: Json | null
          query_normalized?: string
          query_text?: string
          result_candidate_ids?: string[] | null
          result_company_ids?: string[] | null
          total_results?: number | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_cache_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_enrollments: {
        Row: {
          completed_at: string | null
          current_step_id: string | null
          enrolled_at: string
          enrolled_by: string | null
          entity_id: string
          entity_type: Database["hiring"]["Enums"]["entity_type"]
          id: string
          last_error: string | null
          metadata: Json | null
          next_run_at: string | null
          paused_at: string | null
          sequence_id: string
          status: Database["hiring"]["Enums"]["enrollment_status"]
          unsubscribed_at: string | null
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          current_step_id?: string | null
          enrolled_at?: string
          enrolled_by?: string | null
          entity_id: string
          entity_type: Database["hiring"]["Enums"]["entity_type"]
          id?: string
          last_error?: string | null
          metadata?: Json | null
          next_run_at?: string | null
          paused_at?: string | null
          sequence_id: string
          status?: Database["hiring"]["Enums"]["enrollment_status"]
          unsubscribed_at?: string | null
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          current_step_id?: string | null
          enrolled_at?: string
          enrolled_by?: string | null
          entity_id?: string
          entity_type?: Database["hiring"]["Enums"]["entity_type"]
          id?: string
          last_error?: string | null
          metadata?: Json | null
          next_run_at?: string | null
          paused_at?: string | null
          sequence_id?: string
          status?: Database["hiring"]["Enums"]["enrollment_status"]
          unsubscribed_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrollments_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "sequence_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_enrolled_by_fkey"
            columns: ["enrolled_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          body_template: string | null
          config: Json | null
          created_at: string
          delay_minutes: number | null
          id: string
          kind: Database["hiring"]["Enums"]["sequence_step_kind"]
          position: number
          sequence_id: string
          subject_template: string | null
          task_body: string | null
          task_title: string | null
          workspace_id: string
        }
        Insert: {
          body_template?: string | null
          config?: Json | null
          created_at?: string
          delay_minutes?: number | null
          id?: string
          kind: Database["hiring"]["Enums"]["sequence_step_kind"]
          position: number
          sequence_id: string
          subject_template?: string | null
          task_body?: string | null
          task_title?: string | null
          workspace_id: string
        }
        Update: {
          body_template?: string | null
          config?: Json | null
          created_at?: string
          delay_minutes?: number | null
          id?: string
          kind?: Database["hiring"]["Enums"]["sequence_step_kind"]
          position?: number
          sequence_id?: string
          subject_template?: string | null
          task_body?: string | null
          task_title?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          created_at: string
          created_by: string | null
          default_job_id: string | null
          description: string | null
          id: string
          name: string
          owner_id: string | null
          status: Database["hiring"]["Enums"]["sequence_status"]
          target_entity_type: Database["hiring"]["Enums"]["entity_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_job_id?: string | null
          description?: string | null
          id?: string
          name: string
          owner_id?: string | null
          status?: Database["hiring"]["Enums"]["sequence_status"]
          target_entity_type: Database["hiring"]["Enums"]["entity_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_job_id?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          status?: Database["hiring"]["Enums"]["sequence_status"]
          target_entity_type?: Database["hiring"]["Enums"]["entity_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequences_default_role_id_fkey"
            columns: ["default_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequences_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          anonymized_pdf_url: string | null
          application_id: string
          client_decided_at: string | null
          client_decision: string | null
          created_at: string
          first_opened_at: string | null
          id: string
          last_opened_at: string | null
          open_count: number
          sent_at: string
          view_token: string | null
          workspace_id: string
        }
        Insert: {
          anonymized_pdf_url?: string | null
          application_id: string
          client_decided_at?: string | null
          client_decision?: string | null
          created_at?: string
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          sent_at?: string
          view_token?: string | null
          workspace_id: string
        }
        Update: {
          anonymized_pdf_url?: string | null
          application_id?: string
          client_decided_at?: string | null
          client_decision?: string | null
          created_at?: string
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          sent_at?: string
          view_token?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          body: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_at: string | null
          entity_id: string | null
          entity_type: Database["hiring"]["Enums"]["entity_type"] | null
          id: string
          priority: Database["hiring"]["Enums"]["task_priority"]
          status: Database["hiring"]["Enums"]["task_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          body?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: Database["hiring"]["Enums"]["entity_type"] | null
          id?: string
          priority?: Database["hiring"]["Enums"]["task_priority"]
          status?: Database["hiring"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          body?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: Database["hiring"]["Enums"]["entity_type"] | null
          id?: string
          priority?: Database["hiring"]["Enums"]["task_priority"]
          status?: Database["hiring"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          team_role: Database["hiring"]["Enums"]["team_role"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          team_role?: Database["hiring"]["Enums"]["team_role"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          team_role?: Database["hiring"]["Enums"]["team_role"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      unlocks: {
        Row: {
          application_id: string
          candidate_notified_at: string | null
          client_revealed_at: string | null
          created_at: string
          id: string
          payment_id: string
          submission_id: string | null
          unlocked_at: string
          workspace_id: string
        }
        Insert: {
          application_id: string
          candidate_notified_at?: string | null
          client_revealed_at?: string | null
          created_at?: string
          id?: string
          payment_id: string
          submission_id?: string | null
          unlocked_at?: string
          workspace_id: string
        }
        Update: {
          application_id?: string
          candidate_notified_at?: string | null
          client_revealed_at?: string | null
          created_at?: string
          id?: string
          payment_id?: string
          submission_id?: string | null
          unlocked_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unlocks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unlocks_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unlocks_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unlocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          billing_email: string | null
          created_at: string
          id: string
          name: string
          onboarding_completed_at: string | null
          plan_tier: Database["hiring"]["Enums"]["plan_tier"]
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          id?: string
          name: string
          onboarding_completed_at?: string | null
          plan_tier?: Database["hiring"]["Enums"]["plan_tier"]
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          id?: string
          name?: string
          onboarding_completed_at?: string | null
          plan_tier?: Database["hiring"]["Enums"]["plan_tier"]
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_team_member_id: { Args: never; Returns: string }
      entity_visible: {
        Args: {
          entity_id: string
          entity_type: Database["hiring"]["Enums"]["entity_type"]
        }
        Returns: boolean
      }
      is_workspace_admin: { Args: never; Returns: boolean }
      user_visible_candidate_ids: { Args: never; Returns: string[] }
      user_visible_job_ids: { Args: never; Returns: string[] }
      user_workspace_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      candidate_source:
        | "linkedin"
        | "indeed"
        | "referral"
        | "direct"
        | "other"
        | "bulk_import"
      company_status: "none" | "prospect" | "client" | "partner"
      custom_field_kind:
        | "text"
        | "long_text"
        | "number"
        | "boolean"
        | "date"
        | "select"
        | "multi_select"
        | "url"
        | "email"
      deal_stage:
        | "lead"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      engagement_kind: "retained" | "contingent" | "rpo"
      enrollment_status:
        | "active"
        | "paused"
        | "completed"
        | "replied"
        | "unsubscribed"
        | "bounced"
        | "failed"
      entity_type:
        | "candidate"
        | "job"
        | "application"
        | "company"
        | "contact"
        | "deal"
      interview_status:
        | "pending"
        | "link_sent"
        | "in_progress"
        | "completed"
        | "failed"
        | "expired"
      message_channel: "email" | "linkedin" | "whatsapp" | "sms" | "other"
      message_direction: "inbound" | "outbound"
      payment_kind: "role_publish" | "candidate_unlock"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      pipeline_category:
        | "sourced"
        | "contacted"
        | "answered"
        | "applied"
        | "screening"
        | "submitted"
        | "interview"
        | "offer"
        | "hired"
        | "rejected"
        | "withdrawn"
      plan_tier: "trial" | "active" | "past_due" | "canceled" | "free"
      role_status:
        | "borrador"
        | "activa"
        | "por_cerrar"
        | "cubierta"
        | "cancelada"
      role_type: "full_headhunting" | "hybrid_ai_hunting" | "inbound_ai_driven"
      screening_kind: "form" | "text_chat" | "voice"
      sequence_status: "draft" | "active" | "paused" | "archived"
      sequence_step_kind:
        | "email"
        | "manual_task"
        | "wait"
        | "linkedin_message"
        | "whatsapp"
      task_priority: "low" | "normal" | "high"
      task_status: "open" | "done" | "cancelled"
      team_role: "owner" | "admin" | "recruiter"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
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
  hiring: {
    Enums: {
      candidate_source: [
        "linkedin",
        "indeed",
        "referral",
        "direct",
        "other",
        "bulk_import",
      ],
      company_status: ["none", "prospect", "client", "partner"],
      custom_field_kind: [
        "text",
        "long_text",
        "number",
        "boolean",
        "date",
        "select",
        "multi_select",
        "url",
        "email",
      ],
      deal_stage: [
        "lead",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      engagement_kind: ["retained", "contingent", "rpo"],
      enrollment_status: [
        "active",
        "paused",
        "completed",
        "replied",
        "unsubscribed",
        "bounced",
        "failed",
      ],
      entity_type: [
        "candidate",
        "job",
        "application",
        "company",
        "contact",
        "deal",
      ],
      interview_status: [
        "pending",
        "link_sent",
        "in_progress",
        "completed",
        "failed",
        "expired",
      ],
      message_channel: ["email", "linkedin", "whatsapp", "sms", "other"],
      message_direction: ["inbound", "outbound"],
      payment_kind: ["role_publish", "candidate_unlock"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      pipeline_category: [
        "sourced",
        "contacted",
        "answered",
        "applied",
        "screening",
        "submitted",
        "interview",
        "offer",
        "hired",
        "rejected",
        "withdrawn",
      ],
      plan_tier: ["trial", "active", "past_due", "canceled", "free"],
      role_status: [
        "borrador",
        "activa",
        "por_cerrar",
        "cubierta",
        "cancelada",
      ],
      role_type: ["full_headhunting", "hybrid_ai_hunting", "inbound_ai_driven"],
      screening_kind: ["form", "text_chat", "voice"],
      sequence_status: ["draft", "active", "paused", "archived"],
      sequence_step_kind: [
        "email",
        "manual_task",
        "wait",
        "linkedin_message",
        "whatsapp",
      ],
      task_priority: ["low", "normal", "high"],
      task_status: ["open", "done", "cancelled"],
      team_role: ["owner", "admin", "recruiter"],
    },
  },
  public: {
    Enums: {},
  },
} as const
