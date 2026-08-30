export const DOCUMENT_CATEGORIES = [
  {
    id: "photos_images",
    label: "Photos & images",
    description: "Photographs, scans, and image records",
  },
  { id: "resumes", label: "Resumes", description: "CVs and career histories" },
  {
    id: "journals",
    label: "Written journals",
    description: "Diaries, logs, and reflections",
  },
  {
    id: "autobiographies",
    label: "Autobiographies",
    description: "Your life in your own words",
  },
  {
    id: "biographies",
    label: "Biographies",
    description: "Life stories about other people",
  },
  {
    id: "family_history",
    label: "Family history",
    description: "Genealogy and family records",
  },
  {
    id: "letters_correspondence",
    label: "Letters & correspondence",
    description: "Letters, emails, and messages",
  },
  {
    id: "personal_identity",
    label: "Personal & identity",
    description: "Sensitive identity and personal records",
    sensitive: true,
  },
  {
    id: "creative_works",
    label: "Creative works",
    description: "Stories, poems, and manuscripts",
  },
  {
    id: "records_research",
    label: "Records & research",
    description: "Certificates, reports, and source material",
  },
  {
    id: "other",
    label: "Other lore",
    description: "Anything that belongs elsewhere",
  },
  {
    id: "unfiled",
    label: "Unfiled",
    description: "Uploads awaiting classification",
  },
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["id"];
export type DocumentFolderFilter = "all" | DocumentCategory;

export function documentCategoryLabel(category: DocumentCategory): string {
  return (
    DOCUMENT_CATEGORIES.find((item) => item.id === category)?.label ?? "Unfiled"
  );
}

export const DOCUMENT_SUBTYPES = [
  { id: "passport", label: "Passport" },
  { id: "drivers_license", label: "Driver's License" },
  { id: "diploma", label: "Diploma" },
  { id: "certificate", label: "Certificate" },
  { id: "other_id", label: "Other ID" },
] as const;

export type DocumentSubtype = (typeof DOCUMENT_SUBTYPES)[number]["id"];

export function documentSubtypeLabel(subtype: string | null | undefined): string | null {
  if (!subtype) return null;
  return DOCUMENT_SUBTYPES.find((item) => item.id === subtype)?.label ?? null;
}
