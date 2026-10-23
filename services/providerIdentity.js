export const PROVIDER_TYPES = Object.freeze(["individual", "company", "organization"]);

const clean = (value) => typeof value === "string" ? value.trim() : "";

export const providerTypeLabel = (providerType) => ({
  individual: "Individual",
  company: "Company",
  organization: "Organization",
}[providerType] || null);

export const providerDisplayName = (user) => {
  if (user?.account_type !== "local") return user?.username || null;
  if (user.provider_type === "individual") return clean(user.contact_person_name) || user.username;
  if (user.provider_type === "company") return clean(user.company_name) || user.username;
  if (user.provider_type === "organization") return clean(user.organization_name) || user.username;
  return user.username;
};

export const withProviderIdentity = (user) => ({
  ...user,
  providerDisplayName: providerDisplayName(user),
  providerTypeLabel: providerTypeLabel(user?.provider_type),
  providerProfileComplete: Boolean(user?.provider_profile_complete),
});

export const validateProviderProfile = (body) => {
  const providerType = clean(body.provider_type);
  const contactPersonName = clean(body.contact_person_name);
  const companyName = clean(body.company_name);
  const organizationName = clean(body.organization_name);

  if (!PROVIDER_TYPES.includes(providerType)) {
    return { error: { code: "provider_type_required", error: "Choose Individual, Company, or Organization." } };
  }
  if (!contactPersonName) {
    return { error: { code: "contact_person_required", error: "Contact person name is required." } };
  }
  if (contactPersonName.length > 150 || companyName.length > 200 || organizationName.length > 200) {
    return { error: { code: "provider_field_too_long", error: "Provider names are too long." } };
  }
  if (providerType === "company" && !companyName) {
    return { error: { code: "company_name_required", error: "Company name is required." } };
  }
  if (providerType === "organization" && !organizationName) {
    return { error: { code: "organization_name_required", error: "Organization name is required." } };
  }
  if ((providerType !== "company" && companyName) || (providerType !== "organization" && organizationName)) {
    return { error: { code: "provider_fields_conflict", error: "Only provide the entity name that matches the selected provider type." } };
  }

  return {
    value: {
      provider_type: providerType,
      contact_person_name: contactPersonName,
      company_name: providerType === "company" ? companyName : null,
      organization_name: providerType === "organization" ? organizationName : null,
      provider_profile_complete: true,
    },
  };
};

export const emptyProviderProfile = Object.freeze({
  provider_type: null,
  contact_person_name: null,
  company_name: null,
  organization_name: null,
  provider_profile_complete: false,
});

export const providerDisplayNameSql = (alias) => `CASE
  WHEN ${alias}.account_type = 'local' AND ${alias}.provider_type = 'individual' THEN COALESCE(NULLIF(${alias}.contact_person_name, ''), ${alias}.username)
  WHEN ${alias}.account_type = 'local' AND ${alias}.provider_type = 'company' THEN COALESCE(NULLIF(${alias}.company_name, ''), ${alias}.username)
  WHEN ${alias}.account_type = 'local' AND ${alias}.provider_type = 'organization' THEN COALESCE(NULLIF(${alias}.organization_name, ''), ${alias}.username)
  ELSE ${alias}.username
END`;

export const providerTypeLabelSql = (alias) => `CASE ${alias}.provider_type
  WHEN 'individual' THEN 'Individual'
  WHEN 'company' THEN 'Company'
  WHEN 'organization' THEN 'Organization'
  ELSE NULL
END`;

