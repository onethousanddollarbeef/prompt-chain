export type Profile = {
  id: string;
  is_superadmin: boolean;
  is_matrix_admin: boolean;
};

export type HumorFlavor = {
  id: string;
  name: string;
  description: string | null;
  created_by_user_id: string;
  modified_by_user_id: string;
  created_datetime_utc: string;
  modified_datetime_utc: string;
};

export type HumorFlavorStep = {
  id: string;
  flavor_id: string;
  position: number;
  title: string;
  instruction: string;
  created_by_user_id: string;
  modified_by_user_id: string;
  created_datetime_utc: string;
  modified_datetime_utc: string;
};

export type CaptionRun = {
  id: string;
  flavor_id: string;
  image_url: string;
  response_json: unknown;
  created_by_user_id: string;
  modified_by_user_id: string;
  created_datetime_utc: string;
  modified_datetime_utc: string;
};