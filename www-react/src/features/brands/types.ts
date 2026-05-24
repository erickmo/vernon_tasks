export type Brand = {
  id: string;
  brand_name: string;
  logo: string | null;
  description: string | null;
};

export type BrandFormValues = {
  brand_name: string;
  logo?: string | null;
  description?: string | null;
};

export type BrandPermissions = {
  can_create: boolean;
  can_write: boolean;
  can_delete: boolean;
};

export type BrandOption = {
  id: string;
  brand_name: string;
  logo: string | null;
};
