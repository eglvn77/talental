import type { Locale } from "./config";

/**
 * UI message catalog. `es` is the source of truth (the app's original
 * language) and defines the shape; `en` must mirror it exactly (enforced
 * by the `Messages` type). Add keys here as each screen is migrated —
 * always add BOTH languages so a migrated screen is never mixed.
 *
 * Keys are namespaced by area (nav, common, account, settings, …) and
 * resolved by dot path: t("nav.candidates").
 */

export const es = {
  common: {
    save: "Guardar",
    saving: "Guardando…",
    cancel: "Cancelar",
    delete: "Eliminar",
    edit: "Editar",
    create: "Crear",
    add: "Agregar",
    remove: "Quitar",
    close: "Cerrar",
    confirm: "Confirmar",
    search: "Buscar",
    loading: "Cargando…",
    back: "Volver",
    next: "Siguiente",
    previous: "Anterior",
    yes: "Sí",
    no: "No",
    optional: "opcional",
    required: "obligatorio",
    name: "Nombre",
    email: "Email",
    phone: "Teléfono",
    status: "Estatus",
    actions: "Acciones",
    color: "Color",
    language: "Idioma",
    none: "Ninguno",
    all: "Todos",
    clear: "Limpiar",
    apply: "Aplicar",
    filters: "Filtros",
    noResults: "Sin resultados",
    comingSoon: "Próximamente",
    skipToContent: "Saltar al contenido",
  },
  nav: {
    jobs: "Vacantes",
    candidates: "Candidatos",
    companies: "Empresas",
    contacts: "Contactos",
    deals: "CRM",
    finances: "Finanzas",
    settings: "Ajustes",
    mainNavAria: "Navegación principal",
    sectionsAria: "Secciones",
  },
  account: {
    menuAria: "Menú de cuenta",
    account: "Cuenta",
    settings: "Ajustes",
    signOut: "Cerrar sesión",
    language: "Idioma",
  },
};

export type Messages = typeof es;

/** English mirror of `es`. Typed as `Messages` so any missing/extra key
 *  is a compile error — keeping the two languages structurally in sync. */
export const en: Messages = {
  common: {
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    add: "Add",
    remove: "Remove",
    close: "Close",
    confirm: "Confirm",
    search: "Search",
    loading: "Loading…",
    back: "Back",
    next: "Next",
    previous: "Previous",
    yes: "Yes",
    no: "No",
    optional: "optional",
    required: "required",
    name: "Name",
    email: "Email",
    phone: "Phone",
    status: "Status",
    actions: "Actions",
    color: "Color",
    language: "Language",
    none: "None",
    all: "All",
    clear: "Clear",
    apply: "Apply",
    filters: "Filters",
    noResults: "No results",
    comingSoon: "Coming soon",
    skipToContent: "Skip to content",
  },
  nav: {
    jobs: "Jobs",
    candidates: "Candidates",
    companies: "Companies",
    contacts: "Contacts",
    deals: "CRM",
    finances: "Finances",
    settings: "Settings",
    mainNavAria: "Main navigation",
    sectionsAria: "Sections",
  },
  account: {
    menuAria: "Account menu",
    account: "Account",
    settings: "Settings",
    signOut: "Sign out",
    language: "Language",
  },
};

export const MESSAGES: Record<Locale, Messages> = { es, en };
