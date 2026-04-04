export type Profile = {
  id: string;
  is_superadmin: boolean;
  is_matrix_admin: boolean;
};

export type HumorFlavor = {
  id: string;
  slug: string;
  description: string | null;
  created_by_user_id: string;
  created_datetime_utc: string;
  modified_by_user_id: string | null;
  modified_datetime_utc: string | null;
};

export type HumorFlavorStep = {
  id: number;
  humor_flavor_id: number;
  order_by: number;
  description: string | null;
  llm_user_prompt: string | null;
  llm_system_prompt: string | null;
  llm_temperature: number | null;
  llm_input_type_id: number | null;
  llm_output_type_id: number | null;
  llm_model_id: number | null;
  humor_flavor_step_type_id: number | null;
  created_by_user_id: string | null;
  modified_by_user_id: string | null;
  created_datetime_utc: string;
  modified_datetime_utc: string | null;
};
