export type Profile = {
  id: string;
  is_superadmin: boolean;
  is_matrix_admin: boolean;
};

export type HumorFlavor = {
  id: string;
  slug: string;
  description: string | null;
  created_by: string;
  created_at: string;
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
