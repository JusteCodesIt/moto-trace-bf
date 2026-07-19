type Locale = "fr" | "en";

const translations: Record<Locale, Record<string, string>> = {
  fr: {
    "nav.dashboard": "Tableau de bord",
    "nav.fleet": "Flotte",
    "nav.alerts": "Alertes",
    "nav.stats": "Analytics",
    "nav.trips": "Trajets",
    "nav.geofence": "Géozones",
    "nav.remote": "Télécommande",
    "nav.settings": "Paramètres",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.delete": "Supprimer",
    "common.confirm": "Confirmer",
    "common.loading": "Chargement…",
    "common.error": "Erreur",
    "common.retry": "Réessayer",
    "common.never": "jamais",
    "engine.on": "Moteur en marche",
    "engine.off": "Moteur coupé",
    "alerts.title": "Centre d'alertes",
    "alerts.markAllRead": "Tout marquer lu",
    "alerts.empty": "Tout est tranquille",
    "stats.title": "Analytics & score conducteur",
    "stats.exportCsv": "Exporter CSV",
    "fleet.title": "Gestion de la flotte",
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.fleet": "Fleet",
    "nav.alerts": "Alerts",
    "nav.stats": "Analytics",
    "nav.trips": "Trips",
    "nav.geofence": "Geofences",
    "nav.remote": "Remote control",
    "nav.settings": "Settings",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.confirm": "Confirm",
    "common.loading": "Loading…",
    "common.error": "Error",
    "common.retry": "Retry",
    "common.never": "never",
    "engine.on": "Engine running",
    "engine.off": "Engine off",
    "alerts.title": "Alert center",
    "alerts.markAllRead": "Mark all read",
    "alerts.empty": "All quiet",
    "stats.title": "Analytics & driver score",
    "stats.exportCsv": "Export CSV",
    "fleet.title": "Fleet management",
  },
};

let currentLocale: Locale = "fr";

export function setLocale(locale: Locale) {
  currentLocale = locale;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("autotrack-locale", locale);
  }
}

export function getLocale(): Locale {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("autotrack-locale");
    if (stored === "en" || stored === "fr") {
      currentLocale = stored;
    }
  }
  return currentLocale;
}

export function t(key: string): string {
  return translations[currentLocale]?.[key] ?? translations.fr[key] ?? key;
}

export function getAvailableLocales(): Locale[] {
  return ["fr", "en"];
}
