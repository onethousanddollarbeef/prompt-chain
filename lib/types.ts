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
  id: string;
  flavor_id: string;
  position: number;
  title: string;
  instruction: string;
  created_at: string;
};

export type CaptionRun = {
  id: string;
  flavor_id: string;
  image_url: string;
  response_json: unknown;
  created_at: string;
};
